import type { AppDatabase } from "./db.js";
import type { ConnectorRegistry } from "./connectors/index.js";
import type { CollectedItem, StoredSubscription } from "./types.js";
import { canonicalizeUrl, sourceKey } from "./util.js";

export class PollWorker {
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly running = new Set<string>();

  constructor(
    private readonly db: AppDatabase,
    private readonly connectors: ConnectorRegistry,
    private readonly push: {
      send(userId: string, subscriptionId: string, events: Array<{ eventId: number; item: CollectedItem }>): Promise<void>;
    },
    private readonly tickSeconds: number,
    private readonly concurrency = 5,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.tickSeconds * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = this.db.listDueSubscriptions(new Date().toISOString());
      let offset = 0;
      const consume = async () => {
        while (offset < due.length) {
          const subscription = due[offset++];
          if (subscription) await this.run(subscription);
        }
      };
      await Promise.allSettled(Array.from({ length: Math.min(this.concurrency, due.length) }, consume));
    } finally {
      this.ticking = false;
    }
  }

  async run(subscription: StoredSubscription): Promise<void> {
    if (this.running.has(subscription.id)) return;
    this.running.add(subscription.id);
    const startedAt = new Date();
    try {
      for (const [index, source] of subscription.plan.sources.entries()) {
        if (source.provider === "webhook") continue;
        const key = sourceKey(source, index);
        const connector = this.connectors.get(source.provider);
        if (!connector) {
          this.db.markSourceError(subscription.id, key, `No connector for ${source.provider}`);
          continue;
        }
        const state = this.db.getSourceState(subscription.id, key);
        const isBaseline = !state.baselineCompletedAt;
        try {
          const items = await connector.collect(source, {
            subscriptionId: subscription.id,
            subscriptionCreatedAt: subscription.createdAt,
            lastSuccessfulAt: state.lastSuccessfulAt,
            now: startedAt,
          });
          for (const item of items) {
            const publishedAfterRegistration = !item.publishedAt || item.publishedAt >= subscription.createdAt;
            const visible = !isBaseline && publishedAfterRegistration;
            const result = this.db.storeItemAndEvent({
              subscriptionId: subscription.id,
              item,
              canonicalUrl: canonicalizeUrl(item.url),
              visible,
              now: startedAt.toISOString(),
            });
          }
          this.db.markSourceSuccess(subscription.id, key, startedAt.toISOString(), isBaseline);
        } catch (error) {
          this.db.markSourceError(
            subscription.id,
            key,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      const pendingPush = this.db.getPendingPushEvents(subscription.id);
      await this.push.send(subscription.userId, subscription.id, pendingPush);
    } finally {
      const next = new Date(startedAt.getTime() + subscription.plan.intervalSeconds * 1000).toISOString();
      this.db.scheduleNext(subscription.id, next, startedAt.toISOString());
      this.running.delete(subscription.id);
    }
  }
}
