import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDatabase } from "./db.js";
import type { PlannerResult } from "./planner.js";
import type { CollectedItem } from "./types.js";
import { canonicalizeUrl, stableId } from "./util.js";

const subscriptionBody = z.object({ keyword: z.string().trim().min(2).max(500) });
const deviceBody = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["ios", "android", "web"]),
});
const subscriptionStatusBody = z.object({ active: z.boolean() });
const eventQuery = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const webhookItem = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  url: z.string().url(),
  title: z.string().min(1).max(500),
  summary: z.string().max(5000).optional(),
  publishedAt: z.string().datetime().optional(),
  data: z.unknown().optional(),
});
const webhookBody = z.object({ items: z.array(webhookItem).min(1).max(100) });

function userId(request: FastifyRequest): string {
  const value = request.headers["x-user-id"];
  if (typeof value !== "string" || value.length < 1 || value.length > 200) {
    throw Object.assign(new Error("x-user-id header is required"), { statusCode: 401 });
  }
  return value;
}

function safeEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildApp(dependencies: {
  db: AppDatabase;
  planner: { create(keyword: string): Promise<PlannerResult> };
  worker: { tick(): Promise<void> };
  push: {
    send(userId: string, subscriptionId: string, events: Array<{ eventId: number; item: CollectedItem }>): Promise<void>;
  };
}, options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 1_000_000 });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      void reply.status(400).send({ error: "validation_error", details: error.flatten() });
      return;
    }
    const statusCode = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
    const message = error instanceof Error ? error.message : "Invalid request";
    void reply.status(statusCode).send({
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: statusCode >= 500 ? "Unexpected server error" : message,
    });
  });

  app.get("/health", async () => ({ ok: true, now: new Date().toISOString() }));

  app.post("/v1/subscriptions", async (request, reply) => {
    const owner = userId(request);
    const body = subscriptionBody.parse(request.body);
    const plannerResult = await dependencies.planner.create(body.keyword);
    const id = randomUUID();
    const webhookSecret = randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    dependencies.db.createSubscription({
      id,
      userId: owner,
      keyword: body.keyword,
      plan: plannerResult.plan,
      webhookSecret,
      now,
    });
    void dependencies.worker.tick();
    return reply.status(201).send({
      id,
      keyword: body.keyword,
      plan: plannerResult.plan,
      planner: { mode: plannerResult.mode, fallbackReason: plannerResult.fallbackReason },
      createdAt: now,
      webhook: {
        url: `/v1/webhooks/${id}/default`,
        secret: webhookSecret,
        secretHeader: "x-webhook-secret",
      },
    });
  });

  app.get("/v1/subscriptions", async (request) => {
    const owner = userId(request);
    return { subscriptions: dependencies.db.listSubscriptions(owner) };
  });

  app.get("/v1/subscriptions/:id", async (request, reply) => {
    const owner = userId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const subscription = dependencies.db.getSubscription(id);
    if (!subscription || subscription.userId !== owner) return reply.status(404).send({ error: "not_found" });
    return subscription;
  });

  app.delete("/v1/subscriptions/:id", async (request, reply) => {
    const owner = userId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!dependencies.db.deactivateSubscription(id, owner)) return reply.status(404).send({ error: "not_found" });
    return reply.status(204).send();
  });

  app.patch("/v1/subscriptions/:id/status", async (request, reply) => {
    const owner = userId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { active } = subscriptionStatusBody.parse(request.body);
    if (!dependencies.db.setSubscriptionActive(id, owner, active, new Date().toISOString())) {
      return reply.status(404).send({ error: "not_found" });
    }
    if (active) void dependencies.worker.tick();
    return reply.status(204).send();
  });

  app.get("/v1/subscriptions/:id/events", async (request, reply) => {
    const owner = userId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = eventQuery.parse(request.query);
    const subscription = dependencies.db.getSubscription(id);
    if (!subscription || subscription.userId !== owner) return reply.status(404).send({ error: "not_found" });
    return dependencies.db.pollEvents(id, query.cursor, query.limit);
  });

  app.get("/v1/events", async (request) => {
    const owner = userId(request);
    const query = eventQuery.parse(request.query);
    return dependencies.db.pollEventsForUser(owner, query.cursor, query.limit);
  });

  app.post("/v1/devices", async (request, reply) => {
    const owner = userId(request);
    const body = deviceBody.parse(request.body);
    dependencies.db.registerDevice(owner, body.token, body.platform, new Date().toISOString());
    return reply.status(204).send();
  });

  app.delete("/v1/devices", async (request, reply) => {
    const owner = userId(request);
    const { token } = deviceBody.pick({ token: true }).parse(request.body);
    if (!dependencies.db.deactivateDeviceForUser(token, owner)) {
      return reply.status(404).send({ error: "not_found" });
    }
    return reply.status(204).send();
  });

  app.post("/v1/webhooks/:subscriptionId/:source", async (request, reply) => {
    const params = z.object({ subscriptionId: z.string().uuid(), source: z.string().min(1).max(80) }).parse(request.params);
    const secret = dependencies.db.getWebhookSecret(params.subscriptionId);
    if (!secret || !safeEqual(request.headers["x-webhook-secret"] as string | undefined, secret)) {
      return reply.status(401).send({ error: "invalid_webhook_secret" });
    }
    const body = webhookBody.parse(request.body);
    const subscription = dependencies.db.getSubscription(params.subscriptionId);
    if (!subscription) return reply.status(404).send({ error: "not_found" });
    const now = new Date().toISOString();
    const newEvents = [];
    for (const incoming of body.items) {
      const item = {
        provider: `webhook:${stableId(subscription.id, params.source).slice(0, 24)}`,
        externalId: String(incoming.id ?? stableId(canonicalizeUrl(incoming.url))),
        url: incoming.url,
        title: incoming.title,
        summary: incoming.summary,
        publishedAt: incoming.publishedAt,
        raw: incoming.data,
      };
      const visible = !item.publishedAt || item.publishedAt >= subscription.createdAt;
      const stored = dependencies.db.storeItemAndEvent({
        subscriptionId: subscription.id,
        item,
        canonicalUrl: canonicalizeUrl(item.url),
        visible,
        now,
      });
      if (stored.inserted && visible && stored.eventId) newEvents.push({ eventId: stored.eventId, item });
    }
    await dependencies.push.send(subscription.userId, subscription.id, newEvents);
    return reply.status(202).send({ accepted: body.items.length, created: newEvents.length });
  });

  return app;
}
