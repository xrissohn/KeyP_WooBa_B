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

  await app.close();
  db.close();
});
