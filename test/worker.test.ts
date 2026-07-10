import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AppDatabase } from "../src/db.js";
import { ConnectorRegistry } from "../src/connectors/index.js";
import { PollWorker } from "../src/worker.js";
import type { CollectedItem, Connector, SearchPlan } from "../src/types.js";

class SequenceConnector implements Connector {
  private call = 0;

  constructor(private readonly pages: CollectedItem[][]) {}

  async collect(): Promise<CollectedItem[]> {
    const page = this.pages[Math.min(this.call, this.pages.length - 1)] ?? [];
    this.call++;
    return page;
  }
}

test("first poll establishes a baseline and later polls emit each item once", async () => {
  const db = new AppDatabase(":memory:");
  const createdAt = "2026-07-10T00:00:00.000Z";
  const first: CollectedItem = {
    provider: "naver:news",
    externalId: "existing",
    url: "https://example.com/existing",
    title: "Existing result",
    publishedAt: "2026-07-10T00:01:00.000Z",
  };
  const second: CollectedItem = {
    provider: "naver:news",
    externalId: "new",
    url: "https://example.com/new?utm_source=test",
    title: "New result",
    publishedAt: "2026-07-10T00:02:00.000Z",
  };
  const connector = new SequenceConnector([[first], [first, second], [first, second]]);
  const registry = new ConnectorRegistry({ naver: connector });
  const pushed: number[] = [];
  const push = {
    async send(_userId: string, _subscriptionId: string, events: Array<{ eventId: number }>) {
      pushed.push(...events.map((event) => event.eventId));
      db.markPushSent(events.map((event) => event.eventId), new Date().toISOString());
    },
  };
  const worker = new PollWorker(db, registry, push as never, 5);
  const plan: SearchPlan = {
    topic: "news",
    normalizedKeywords: ["test"],
    intervalSeconds: 60,
    sources: [{ provider: "naver", vertical: "news", query: "test" }],
  };
  const id = randomUUID();
  db.createSubscription({ id, userId: "user-1", keyword: "test", plan, webhookSecret: "secret", now: createdAt });

  await worker.run(db.getSubscription(id)!);
  assert.deepEqual(db.pollEvents(id, 0, 50).events, []);

  await worker.run(db.getSubscription(id)!);
  const page = db.pollEvents(id, 0, 50);
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0]?.item.externalId, "new");
  assert.equal(page.events[0]?.item.url, "https://example.com/new");
  assert.equal(pushed.length, 1);

  await worker.run(db.getSubscription(id)!);
  assert.equal(db.pollEvents(id, 0, 50).events.length, 1);
  assert.equal(pushed.length, 1);
  db.close();
});

test("items published before registration are suppressed even when discovered later", async () => {
  const db = new AppDatabase(":memory:");
  const oldItem: CollectedItem = {
    provider: "naver:news",
    externalId: "late-old",
    url: "https://example.com/late-old",
    title: "Late indexed old page",
    publishedAt: "2026-07-09T00:00:00.000Z",
  };
  const connector = new SequenceConnector([[], [oldItem]]);
  const registry = new ConnectorRegistry({ naver: connector });
  const worker = new PollWorker(db, registry, { async send() {} }, 5);
  const id = randomUUID();
  db.createSubscription({
    id,
    userId: "user-1",
    keyword: "test",
    webhookSecret: "secret",
    now: "2026-07-10T00:00:00.000Z",
    plan: {
      topic: "news",
      normalizedKeywords: ["test"],
      intervalSeconds: 60,
      sources: [{ provider: "naver", vertical: "news", query: "test" }],
    },
  });
  await worker.run(db.getSubscription(id)!);
  await worker.run(db.getSubscription(id)!);
  assert.equal(db.pollEvents(id, 0, 50).events.length, 0);
  db.close();
});
