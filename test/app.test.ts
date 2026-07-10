import assert from "node:assert/strict";
import test from "node:test";
import { AppDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import type { SearchPlan } from "../src/types.js";

test("webhook events are authenticated, deduplicated, and available through cursor polling", async () => {
  const db = new AppDatabase(":memory:");
  const plan: SearchPlan = {
    topic: "general",
    normalizedKeywords: ["release"],
    intervalSeconds: 60,
    sources: [{ provider: "webhook", name: "default" }],
  };
  const app = buildApp({
    db,
    planner: { async create() { return { plan, mode: "fallback" }; } },
    worker: { async tick() {} },
    push: {
      async send(_userId, _subscriptionId, events) {
        db.markPushSent(events.map((event) => event.eventId), new Date().toISOString());
      },
    },
  });

  const created = await app.inject({
    method: "POST",
    url: "/v1/subscriptions",
    headers: { "x-user-id": "user-1" },
    payload: { keyword: "new release" },
  });
  assert.equal(created.statusCode, 201);
  const subscription = created.json() as { id: string; webhook: { url: string; secret: string } };

  const unauthorized = await app.inject({
    method: "POST",
    url: subscription.webhook.url,
    payload: { items: [{ id: "release-1", url: "https://example.com/release", title: "Release 1" }] },
  });
  assert.equal(unauthorized.statusCode, 401);

  const payload = { items: [{ id: "release-1", url: "https://example.com/release", title: "Release 1" }] };
  const first = await app.inject({
    method: "POST",
    url: subscription.webhook.url,
    headers: { "x-webhook-secret": subscription.webhook.secret },
    payload,
  });
  assert.equal(first.statusCode, 202);
  assert.equal(first.json().created, 1);

  const duplicate = await app.inject({
    method: "POST",
    url: subscription.webhook.url,
    headers: { "x-webhook-secret": subscription.webhook.secret },
    payload,
  });
  assert.equal(duplicate.json().created, 0);

  const events = await app.inject({
    method: "GET",
    url: `/v1/subscriptions/${subscription.id}/events?cursor=0`,
    headers: { "x-user-id": "user-1" },
  });
  assert.equal(events.statusCode, 200);
  assert.equal(events.json().events.length, 1);
  assert.equal(events.json().nextCursor > 0, true);

  const userEvents = await app.inject({
    method: "GET",
    url: "/v1/events?cursor=0",
    headers: { "x-user-id": "user-1" },
  });
  assert.equal(userEvents.json().events.length, 1);

  const subscriptions = await app.inject({
    method: "GET",
    url: "/v1/subscriptions",
    headers: { "x-user-id": "user-1" },
  });
  assert.equal(subscriptions.json().subscriptions.length, 1);

  const paused = await app.inject({
    method: "PATCH",
    url: `/v1/subscriptions/${subscription.id}/status`,
    headers: { "x-user-id": "user-1" },
    payload: { active: false },
  });
  assert.equal(paused.statusCode, 204);
  const pausedList = await app.inject({
    method: "GET",
    url: "/v1/subscriptions",
    headers: { "x-user-id": "user-1" },
  });
  assert.equal(pausedList.json().subscriptions.length, 1);
  assert.equal(pausedList.json().subscriptions[0].active, false);
  const resumed = await app.inject({
    method: "PATCH",
    url: `/v1/subscriptions/${subscription.id}/status`,
    headers: { "x-user-id": "user-1" },
    payload: { active: true },
  });
  assert.equal(resumed.statusCode, 204);

  const token = "device-token-at-least-twenty-characters";
  assert.equal((await app.inject({
    method: "POST",
    url: "/v1/devices",
    headers: { "x-user-id": "user-1" },
    payload: { token, platform: "ios" },
  })).statusCode, 204);
  assert.equal((await app.inject({
    method: "DELETE",
    url: "/v1/devices",
    headers: { "x-user-id": "user-1" },
    payload: { token },
  })).statusCode, 204);

  await app.close();
  db.close();
});

test("webhook item identities are isolated between subscriptions", async () => {
  const db = new AppDatabase(":memory:");
  const plan: SearchPlan = {
    topic: "general",
    normalizedKeywords: ["release"],
    intervalSeconds: 60,
    sources: [{ provider: "webhook", name: "default" }],
  };
  const app = buildApp({
    db,
    planner: { async create() { return { plan, mode: "fallback" }; } },
    worker: { async tick() {} },
    push: { async send() {} },
  });

  const subscriptions = [];
  for (const userId of ["user-1", "user-2"]) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/subscriptions",
      headers: { "x-user-id": userId },
      payload: { keyword: "new release" },
    });
    subscriptions.push(response.json() as { id: string; webhook: { url: string; secret: string } });
  }

  for (const [index, subscription] of subscriptions.entries()) {
    const response = await app.inject({
      method: "POST",
      url: subscription.webhook.url,
      headers: { "x-webhook-secret": subscription.webhook.secret },
      payload: {
        items: [{
          id: "shared-id",
          url: `https://example.com/releases/${index + 1}`,
          title: `Subscription ${index + 1}`,
        }],
      },
    });
    assert.equal(response.json().created, 1);
  }

  for (const [index, subscription] of subscriptions.entries()) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/subscriptions/${subscription.id}/events`,
      headers: { "x-user-id": `user-${index + 1}` },
    });
    assert.equal(response.json().events[0].item.title, `Subscription ${index + 1}`);
  }

  await app.close();
  db.close();
});
