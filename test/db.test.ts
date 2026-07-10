import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AppDatabase } from "../src/db.js";
import type { SearchPlan } from "../src/types.js";

const webhookPlan: SearchPlan = {
  topic: "release",
  normalizedKeywords: ["release"],
  intervalSeconds: 60,
  sources: [{ provider: "webhook", name: "default" }],
};

test("provider budget consumption never exceeds its daily limit", () => {
  const db = new AppDatabase(":memory:");
  assert.equal(db.tryConsumeProviderBudget("x", "2026-07-10", 1, 2), true);
  assert.equal(db.tryConsumeProviderBudget("x", "2026-07-10", 1, 2), true);
  assert.equal(db.tryConsumeProviderBudget("x", "2026-07-10", 1, 2), false);
  assert.equal(db.getProviderUsage("x", "2026-07-10"), 2);
  assert.equal(db.tryConsumeProviderBudget("x", "2026-07-11", 1, 2), true);
  db.close();
});

test("scheduler leases prevent duplicate claims and expire after timeout", () => {
  const db = new AppDatabase(":memory:");
  const now = "2026-07-10T00:00:00.000Z";
  const id = randomUUID();
  db.createSubscription({ id, installationId: "fid-1", keyword: "release", plan: webhookPlan, webhookSecret: "secret", now });

  assert.equal(db.claimDueSubscriptions({
    owner: "worker-1",
    now,
    leaseUntil: "2026-07-10T00:05:00.000Z",
  }).length, 1);
  assert.equal(db.claimDueSubscriptions({
    owner: "worker-2",
    now,
    leaseUntil: "2026-07-10T00:05:00.000Z",
  }).length, 0);
  assert.equal(db.claimDueSubscriptions({
    owner: "worker-2",
    now: "2026-07-10T00:05:01.000Z",
    leaseUntil: "2026-07-10T00:10:01.000Z",
  }).length, 1);
  db.close();
});

test("provider reconciliation removes legacy sources and disables empty plans", () => {
  const db = new AppDatabase(":memory:");
  const now = "2026-07-10T00:00:00.000Z";
  const mixedId = randomUUID();
  const legacyOnlyId = randomUUID();
  db.createSubscription({ id: mixedId, installationId: "fid-1", keyword: "mixed", plan: webhookPlan, webhookSecret: "one", now });
  db.createSubscription({ id: legacyOnlyId, installationId: "fid-1", keyword: "legacy", plan: webhookPlan, webhookSecret: "two", now });
  db.sqlite.prepare("UPDATE subscriptions SET plan_json = ? WHERE id = ?").run(JSON.stringify({
    ...webhookPlan,
    sources: [{ provider: "naver", vertical: "news", query: "release" }, { provider: "google", query: "release" }],
  }), mixedId);
  db.sqlite.prepare("UPDATE subscriptions SET plan_json = ? WHERE id = ?").run(JSON.stringify({
    ...webhookPlan,
    sources: [{ provider: "saramin", query: "backend" }],
  }), legacyOnlyId);
  db.recordSourceCacheFailure({
    sourceKey: "legacy-cache",
    source: { provider: "google", query: "release" },
    error: "removed provider",
    nextFetchAt: now,
  });
  db.markSourceError(mixedId, "legacy-orphan", "removed provider");
  db.tryConsumeProviderBudget("google", "2026-07-10", 1, 10);

  assert.deepEqual(db.reconcileProviders(["naver", "x", "rss", "webhook"]), {
    updatedSubscriptions: 1,
    deactivatedSubscriptions: 1,
    removedSourceCaches: 1,
    removedOrphanStates: 1,
  });
  assert.deepEqual(db.getSubscription(mixedId)?.plan.sources, [
    { provider: "naver", vertical: "news", query: "release" },
  ]);
  assert.equal(db.getSubscription(legacyOnlyId)?.active, false);
  assert.equal(db.getSourceCache("legacy-cache"), undefined);
  assert.equal(db.getProviderUsage("google", "2026-07-10"), 0);
  db.close();
});

test("push outbox completes only after every device delivery is terminal", () => {
  const db = new AppDatabase(":memory:");
  const now = "2026-07-10T00:00:00.000Z";
  const subscriptionId = randomUUID();
  db.createSubscription({
    id: subscriptionId,
    installationId: "fid-1",
    keyword: "release",
    plan: webhookPlan,
    webhookSecret: "secret",
    now,
  });
  const stored = db.storeItemAndEvent({
    subscriptionId,
    item: {
      provider: "webhook:test",
      externalId: "release-1",
      url: "https://example.com/releases/1",
      title: "Release 1",
    },
    canonicalUrl: "https://example.com/releases/1",
    visible: true,
    now,
  });
  assert.ok(stored.eventId);
  db.registerDevice("user-1", "token-1", "ios", now);
  db.registerDevice("user-1", "token-2", "android", now);
  db.ensurePushDeliveries(stored.eventId, ["token-1", "token-2"], now);
  db.markPushDelivery({ eventId: stored.eventId, token: "token-1", status: "sent", now });
  assert.equal(db.completePushEventIfDelivered(stored.eventId, now), false);
  assert.equal(db.getPendingPushEvents(subscriptionId).length, 1);

  db.markPushDelivery({ eventId: stored.eventId, token: "token-2", status: "invalid", now });
  assert.equal(db.completePushEventIfDelivered(stored.eventId, now), true);
  assert.equal(db.getPendingPushEvents(subscriptionId).length, 0);
  db.close();
});

test("paused subscriptions suppress pending push deliveries without losing feed history", () => {
  const db = new AppDatabase(":memory:");
  const now = "2026-07-10T00:00:00.000Z";
  const subscriptionId = randomUUID();
  db.createSubscription({
    id: subscriptionId,
    installationId: "fid-1",
    keyword: "release",
    plan: webhookPlan,
    webhookSecret: "secret",
    now,
  });
  const stored = db.storeItemAndEvent({
    subscriptionId,
    item: {
      provider: "webhook:test",
      externalId: "release-paused",
      url: "https://example.com/releases/paused",
      title: "Paused release",
    },
    canonicalUrl: "https://example.com/releases/paused",
    visible: true,
    now,
  });
  assert.ok(stored.eventId);
  db.registerDevice("fid-1", "token-1", "ios", now);
  db.ensurePushDeliveries(stored.eventId, ["token-1"], now);

  assert.equal(db.setSubscriptionActive(subscriptionId, "fid-1", false, "2026-07-10T00:01:00.000Z"), true);
  assert.equal(db.getPendingPushEvents(subscriptionId).length, 0);
  assert.equal(db.pollEvents(subscriptionId, 0, 10).events.length, 1);

  db.markPushDelivery({
    eventId: stored.eventId,
    token: "token-1",
    status: "sent",
    now: "2026-07-10T00:02:00.000Z",
  });
  const delivery = db.sqlite.prepare(`
    SELECT status FROM push_deliveries WHERE event_id = ? AND token = ?
  `).get(stored.eventId, "token-1") as { status: string };
  assert.equal(delivery.status, "invalid");
  db.close();
});

test("event polling uses a stable cursor and excludes suppressed or other-user events", () => {
  const db = new AppDatabase(":memory:");
  const now = "2026-07-10T00:00:00.000Z";
  const firstSubscription = randomUUID();
  const secondSubscription = randomUUID();
  db.createSubscription({ id: firstSubscription, installationId: "fid-1", keyword: "release", plan: webhookPlan, webhookSecret: "one", now });
  db.createSubscription({ id: secondSubscription, installationId: "fid-2", keyword: "release", plan: webhookPlan, webhookSecret: "two", now });

  const store = (subscriptionId: string, id: string, visible: boolean) => db.storeItemAndEvent({
    subscriptionId,
    item: {
      provider: `webhook:${subscriptionId}`,
      externalId: id,
      url: `https://example.com/${id}`,
      title: id,
    },
    canonicalUrl: `https://example.com/${id}`,
    visible,
    now,
  });
  store(firstSubscription, "visible-1", true);
  store(firstSubscription, "suppressed", false);
  store(firstSubscription, "visible-2", true);
  store(secondSubscription, "other-user", true);

  const latestFirst = db.pollEventsForInstallation("fid-1", 0, 2);
  assert.deepEqual(latestFirst.events.map((event) => event.item.externalId), ["visible-2", "visible-1"]);

  const firstPage = db.pollEventsForInstallation("fid-1", 0, 1);
  assert.equal(firstPage.events[0]?.item.externalId, "visible-1");
  assert.equal(firstPage.hasMore, true);
  const secondPage = db.pollEventsForInstallation("fid-1", firstPage.nextCursor, 1);
  assert.equal(secondPage.events[0]?.item.externalId, "visible-2");
  assert.equal(secondPage.hasMore, false);
  assert.ok(secondPage.nextCursor > firstPage.nextCursor);
  db.close();
});
