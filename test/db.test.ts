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
  assert.equal(db.tryConsumeProviderBudget("google", "2026-07-10", 1, 2), true);
  assert.equal(db.tryConsumeProviderBudget("google", "2026-07-10", 1, 2), true);
  assert.equal(db.tryConsumeProviderBudget("google", "2026-07-10", 1, 2), false);
  assert.equal(db.getProviderUsage("google", "2026-07-10"), 2);
  assert.equal(db.tryConsumeProviderBudget("google", "2026-07-11", 1, 2), true);
  db.close();
});

test("push outbox completes only after every device delivery is terminal", () => {
  const db = new AppDatabase(":memory:");
  const now = "2026-07-10T00:00:00.000Z";
  const subscriptionId = randomUUID();
  db.createSubscription({
    id: subscriptionId,
    userId: "user-1",
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

test("event polling uses a stable cursor and excludes suppressed or other-user events", () => {
  const db = new AppDatabase(":memory:");
  const now = "2026-07-10T00:00:00.000Z";
  const firstSubscription = randomUUID();
  const secondSubscription = randomUUID();
  db.createSubscription({ id: firstSubscription, userId: "user-1", keyword: "release", plan: webhookPlan, webhookSecret: "one", now });
  db.createSubscription({ id: secondSubscription, userId: "user-2", keyword: "release", plan: webhookPlan, webhookSecret: "two", now });

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

  const firstPage = db.pollEventsForUser("user-1", 0, 1);
  assert.equal(firstPage.events[0]?.item.externalId, "visible-1");
  assert.equal(firstPage.hasMore, true);
  const secondPage = db.pollEventsForUser("user-1", firstPage.nextCursor, 1);
  assert.equal(secondPage.events[0]?.item.externalId, "visible-2");
  assert.equal(secondPage.hasMore, false);
  assert.ok(secondPage.nextCursor > firstPage.nextCursor);
  db.close();
});
