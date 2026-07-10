import assert from "node:assert/strict";
import test from "node:test";
import { AppDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import type { SearchPlan } from "../src/types.js";

const FID_ONE = "cFidInstallationOne_123";
const FID_TWO = "cFidInstallationTwo_456";

async function registerInstallation(app: ReturnType<typeof buildApp>, fid: string, platform = "web") {
  return app.inject({
    method: "PUT",
    url: "/v1/installations/current",
    headers: { "x-firebase-installation-id": fid },
    payload: { platform },
  });
}

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
  }, { logger: false });

  assert.equal((await registerInstallation(app, FID_ONE)).statusCode, 200);

  const created = await app.inject({
    method: "POST",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
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
    headers: { "x-firebase-installation-id": FID_ONE },
  });
  assert.equal(events.statusCode, 200);
  assert.equal(events.json().events.length, 1);
  assert.equal(events.json().nextCursor > 0, true);

  const userEvents = await app.inject({
    method: "GET",
    url: "/v1/events?cursor=0",
    headers: { "x-firebase-installation-id": FID_ONE },
  });
  assert.equal(userEvents.json().events.length, 1);

  const subscriptions = await app.inject({
    method: "GET",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
  });
  assert.equal(subscriptions.json().subscriptions.length, 1);

  const paused = await app.inject({
    method: "PATCH",
    url: `/v1/subscriptions/${subscription.id}/status`,
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { active: false },
  });
  assert.equal(paused.statusCode, 204);
  const pausedList = await app.inject({
    method: "GET",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
  });
  assert.equal(pausedList.json().subscriptions.length, 1);
  assert.equal(pausedList.json().subscriptions[0].active, false);
  const resumed = await app.inject({
    method: "PATCH",
    url: `/v1/subscriptions/${subscription.id}/status`,
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { active: true },
  });
  assert.equal(resumed.statusCode, 204);

  const token = "device-token-at-least-twenty-characters";
  assert.equal((await app.inject({
    method: "POST",
    url: "/v1/devices",
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { token, platform: "ios" },
  })).statusCode, 204);
  assert.equal((await app.inject({
    method: "DELETE",
    url: "/v1/devices",
    headers: { "x-firebase-installation-id": FID_ONE },
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
  }, { logger: false });

  const subscriptions = [];
  for (const fid of [FID_ONE, FID_TWO]) {
    assert.equal((await registerInstallation(app, fid)).statusCode, 200);
    const response = await app.inject({
      method: "POST",
      url: "/v1/subscriptions",
      headers: { "x-firebase-installation-id": fid },
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
      headers: { "x-firebase-installation-id": [FID_ONE, FID_TWO][index] },
    });
    assert.equal(response.json().events[0].item.title, `Subscription ${index + 1}`);
  }

  await app.close();
  db.close();
});

test("API rejects unauthenticated, invalid, and cross-user requests", async () => {
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
  }, { logger: false });

  assert.equal((await app.inject({
    method: "POST",
    url: "/v1/subscriptions",
    payload: { keyword: "valid keyword" },
  })).statusCode, 401);
  assert.equal((await app.inject({
    method: "POST",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { keyword: "valid keyword" },
  })).statusCode, 401);
  await registerInstallation(app, FID_ONE);
  await registerInstallation(app, FID_TWO);
  assert.equal((await app.inject({
    method: "POST",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { keyword: "x" },
  })).statusCode, 400);

  const created = await app.inject({
    method: "POST",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { keyword: "valid keyword" },
  });
  const id = created.json().id as string;
  assert.equal((await app.inject({
    method: "GET",
    url: `/v1/subscriptions/${id}`,
    headers: { "x-firebase-installation-id": FID_TWO },
  })).statusCode, 404);
  assert.equal((await app.inject({
    method: "GET",
    url: `/v1/subscriptions/${id}/events?cursor=-1`,
    headers: { "x-firebase-installation-id": FID_ONE },
  })).statusCode, 400);

  await app.close();
  db.close();
});

test("installation registration links FCM delivery and deactivation removes access", async () => {
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
  }, { logger: false });
  const token = "installation-fcm-token-at-least-twenty";

  const registered = await app.inject({
    method: "PUT",
    url: "/v1/installations/current",
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { platform: "ios", fcmToken: token },
  });
  assert.equal(registered.statusCode, 200);
  assert.equal(registered.json().fid, FID_ONE);
  assert.deepEqual(db.getDeviceTokens(FID_ONE), [token]);

  const created = await app.inject({
    method: "POST",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
    payload: { keyword: "release notice" },
  });
  assert.equal(created.statusCode, 201);

  const removed = await app.inject({
    method: "DELETE",
    url: "/v1/installations/current",
    headers: { "x-firebase-installation-id": FID_ONE },
  });
  assert.equal(removed.statusCode, 204);
  assert.equal(db.getInstallation(FID_ONE), undefined);
  assert.deepEqual(db.getDeviceTokens(FID_ONE), []);
  assert.equal((await app.inject({
    method: "GET",
    url: "/v1/subscriptions",
    headers: { "x-firebase-installation-id": FID_ONE },
  })).statusCode, 401);

  await app.close();
  db.close();
});

test("App Check is required when its verifier enforces it", async () => {
  const db = new AppDatabase(":memory:");
  const app = buildApp({
    db,
    planner: { async create() { throw new Error("not used"); } },
    worker: { async tick() {} },
    appCheck: {
      async verify(token) {
        if (token !== "valid-app-check-token") {
          throw Object.assign(new Error("Invalid Firebase App Check token"), { statusCode: 401 });
        }
      },
    },
    push: { async send() {} },
  }, { logger: false });

  assert.equal((await registerInstallation(app, FID_ONE)).statusCode, 401);
  assert.equal((await app.inject({
    method: "PUT",
    url: "/v1/installations/current",
    headers: {
      "x-firebase-installation-id": FID_ONE,
      "x-firebase-appcheck": "valid-app-check-token",
    },
    payload: { platform: "android" },
  })).statusCode, 200);

  await app.close();
  db.close();
});
