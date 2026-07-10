import { randomUUID } from "node:crypto";
import type { AppDatabase } from "./db.js";
import type { ConnectorRegistry } from "./connectors/index.js";
import type { CollectedItem, SourceContext, SourcePlan, StoredSubscription } from "./types.js";
import { config } from "./config.js";
import { canonicalizeUrl, sourceFingerprint } from "./util.js";

export class PollWorker {
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly running = new Set<string>();
  private readonly sourceRequests = new Map<string, Promise<CollectedItem[]>>();
  private readonly workerId = randomUUID();

  constructor(
    private readonly db: AppDatabase,
    private readonly connectors: ConnectorRegistry,
    private readonly push: {
      send(installationId: string, subscriptionId: string, events: Array<{ eventId: number; item: CollectedItem }>): Promise<void>;
    },
    private readonly tickSeconds: number,
    private readonly concurrency = 5,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.tickSeconds * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.clock();
      const due = this.db.claimDueSubscriptions({
        owner: this.workerId,
        now: now.toISOString(),
        leaseUntil: new Date(now.getTime() + config.schedulerLeaseSeconds * 1000).toISOString(),
      });
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
    const startedAt = this.clock();
    try {
      for (const source of subscription.plan.sources) {
        if (source.provider === "webhook") continue;
        const key = sourceFingerprint(source);
        const state = this.db.getSourceState(subscription.id, key);
        const isBaseline = !state.baselineCompletedAt;
        try {
          const items = await this.collectSource(source, key, {
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
      await this.push.send(subscription.installationId, subscription.id, pendingPush);
    } finally {
      const scheduled = startedAt.getTime() + subscription.plan.intervalSeconds * 1000;
      const next = new Date(Math.max(this.clock().getTime(), scheduled)).toISOString();
      this.db.scheduleNext(subscription.id, next, startedAt.toISOString());
      this.running.delete(subscription.id);
    }
  }

  private async collectSource(
    source: Exclude<SourcePlan, { provider: "webhook" }>,
    key: string,
    context: SourceContext,
  ): Promise<CollectedItem[]> {
    const now = context.now.toISOString();
    const cached = this.db.getSourceCache(key);
    if (cached && cached.nextFetchAt > now) {
      if (cached.items) return cached.items;
      throw new Error(cached.lastError ?? `Source ${source.provider} is waiting for retry`);
    }

    const existing = this.sourceRequests.get(key);
    if (existing) return existing;
    const request = this.fetchAndCacheSource(source, key, context)
      .finally(() => this.sourceRequests.delete(key));
    this.sourceRequests.set(key, request);
    return request;
  }

  private async fetchAndCacheSource(
    source: Exclude<SourcePlan, { provider: "webhook" }>,
    key: string,
    context: SourceContext,
  ): Promise<CollectedItem[]> {
    const now = context.now;
    const nowIso = now.toISOString();
    const cached = this.db.getSourceCache(key);
    if (cached && cached.nextFetchAt > nowIso) {
      if (cached.items) return cached.items;
      throw new Error(cached.lastError ?? `Source ${source.provider} is waiting for retry`);
    }

    const connector = this.connectors.get(source.provider);
    if (!connector) throw new Error(`No connector for ${source.provider}`);
    const policy = config.providers[source.provider];
    const usageDay = this.usageDay(now, policy.budgetTimeZone);
    if (!this.db.tryConsumeProviderBudget(source.provider, usageDay, 1, policy.dailyBudget)) {
      const error = `${source.provider} daily request budget exhausted`;
      this.db.recordSourceCacheFailure({
        sourceKey: key,
        source,
        error,
        nextFetchAt: new Date(now.getTime() + 3_600_000).toISOString(),
      });
      throw new Error(error);
    }

    try {
      const items = await connector.collect(source, {
        ...context,
        lastSuccessfulAt: cached?.fetchedAt ?? context.lastSuccessfulAt,
      });
      const nextFetchAt = new Date(now.getTime() + policy.minIntervalSeconds * 1000).toISOString();
      this.db.recordSourceCacheSuccess({ sourceKey: key, source, items, fetchedAt: nowIso, nextFetchAt });
      return items;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failures = Math.min(6, (cached?.consecutiveFailures ?? 0) + 1);
      const backoffSeconds = Math.min(3600, 60 * (2 ** (failures - 1)));
      this.db.recordSourceCacheFailure({
        sourceKey: key,
        source,
        error: message,
        nextFetchAt: new Date(now.getTime() + backoffSeconds * 1000).toISOString(),
      });
      throw error;
    }
  }

  private usageDay(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  }
}
