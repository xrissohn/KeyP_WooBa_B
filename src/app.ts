import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDatabase, EventFilters } from "./db.js";
import type { PlannerResult } from "./planner.js";
import type { CollectedItem } from "./types.js";
import { canonicalizeUrl, stableId } from "./util.js";

const subscriptionBody = z.object({ keyword: z.string().trim().min(2).max(500) });
const fidSchema = z.string().trim().min(10).max(200).regex(/^[A-Za-z0-9_-]+$/);
const installationBody = z.object({
  platform: z.enum(["ios", "android", "web"]),
  fcmToken: z.string().min(20).max(4096).optional(),
});
const deviceBody = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["ios", "android", "web"]),
});
const subscriptionStatusBody = z.object({ active: z.boolean() });
const bookmarkBody = z.object({ bookmarked: z.boolean() });
const eventQuery = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  subscriptionId: z.string().uuid().optional(),
  provider: z.string().trim().min(1).max(120).optional(),
  q: z.string().trim().min(1).max(300).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  bookmarked: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
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

interface IdentityOptions {
  installationIdRequired: boolean;
  anonymousInstallationId: string;
}

function installationId(request: FastifyRequest, identity: IdentityOptions): string {
  if (!identity.installationIdRequired) return identity.anonymousInstallationId;
  const value = request.headers["x-firebase-installation-id"];
  const parsed = fidSchema.safeParse(value);
  if (!parsed.success) {
    throw Object.assign(new Error("x-firebase-installation-id header is required"), { statusCode: 401 });
  }
  return parsed.data;
}

function registeredInstallationId(request: FastifyRequest, db: AppDatabase, identity: IdentityOptions): string {
  const fid = installationId(request, identity);
  const now = new Date().toISOString();
  if (!db.touchInstallation(fid, now)) {
    if (!identity.installationIdRequired) {
      db.registerInstallation({ fid, now });
      return fid;
    }
    throw Object.assign(new Error("Firebase installation is not registered"), { statusCode: 401 });
  }
  return fid;
}

function safeEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function eventFilters(query: z.infer<typeof eventQuery>): EventFilters {
  return {
    subscriptionId: query.subscriptionId,
    provider: query.provider,
    query: query.q,
    from: query.from,
    to: query.to,
    bookmarked: query.bookmarked,
  };
}

export function buildApp(dependencies: {
  db: AppDatabase;
  planner: { create(keyword: string): Promise<PlannerResult> };
  worker: { tick(): Promise<void> };
  appCheck?: { verify(token: string | undefined): Promise<void> };
  identity?: IdentityOptions;
  push: {
    send(installationId: string, subscriptionId: string, events: Array<{ eventId: number; item: CollectedItem }>): Promise<void>;
  };
}, options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 1_000_000 });
  const identity = dependencies.identity ?? {
    installationIdRequired: true,
    anonymousInstallationId: "test-anonymous-installation",
  };

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

  app.addHook("onRequest", async (request) => {
    const isAppApi = request.url.startsWith("/v1/") && !request.url.startsWith("/v1/webhooks/");
    if (!isAppApi) return;
    const token = request.headers["x-firebase-appcheck"];
    await dependencies.appCheck?.verify(typeof token === "string" ? token : undefined);
  });

  app.get("/health", async () => ({ ok: true, now: new Date().toISOString() }));

  app.put("/v1/installations/current", async (request, reply) => {
    const fid = installationId(request, identity);
    const body = installationBody.parse(request.body);
    const now = new Date().toISOString();
    const installation = dependencies.db.registerInstallation({ fid, platform: body.platform, now });
    if (body.fcmToken) dependencies.db.registerDevice(fid, body.fcmToken, body.platform, now);
    return reply.status(200).send(installation);
  });

  app.get("/v1/installations/current", async (request) => {
    const fid = registeredInstallationId(request, dependencies.db, identity);
    return dependencies.db.getInstallation(fid);
  });

  app.delete("/v1/installations/current", async (request, reply) => {
    const fid = registeredInstallationId(request, dependencies.db, identity);
    dependencies.db.deactivateInstallation(fid, new Date().toISOString());
    return reply.status(204).send();
  });

  app.post("/v1/subscriptions", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const body = subscriptionBody.parse(request.body);
    const plannerResult = await dependencies.planner.create(body.keyword);
    const id = randomUUID();
    const webhookSecret = randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    dependencies.db.createSubscription({
      id,
      installationId: owner,
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
    const owner = registeredInstallationId(request, dependencies.db, identity);
    return { subscriptions: dependencies.db.listSubscriptions(owner) };
  });

  app.get("/v1/subscriptions/:id", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const subscription = dependencies.db.getSubscription(id);
    if (!subscription || subscription.installationId !== owner) return reply.status(404).send({ error: "not_found" });
    return subscription;
  });

  app.delete("/v1/subscriptions/:id", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!dependencies.db.softDeleteSubscription(id, owner, new Date().toISOString())) {
      return reply.status(404).send({ error: "not_found" });
    }
    return reply.status(204).send();
  });

  app.patch("/v1/subscriptions/:id/status", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { active } = subscriptionStatusBody.parse(request.body);
    if (!dependencies.db.setSubscriptionActive(id, owner, active, new Date().toISOString())) {
      return reply.status(404).send({ error: "not_found" });
    }
    if (active) void dependencies.worker.tick();
    return reply.status(204).send();
  });

  app.get("/v1/subscriptions/:id/events", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = eventQuery.parse(request.query);
    const subscription = dependencies.db.getSubscription(id);
    if (!subscription || subscription.installationId !== owner) return reply.status(404).send({ error: "not_found" });
    return dependencies.db.pollEvents(id, query.cursor, query.limit, eventFilters(query));
  });

  app.get("/v1/events", async (request) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const query = eventQuery.parse(request.query);
    return dependencies.db.pollEventsForInstallation(owner, query.cursor, query.limit, eventFilters(query));
  });

  app.get("/v1/bookmarks", async (request) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const query = eventQuery.parse(request.query);
    const filters = eventFilters(query);
    filters.bookmarked = undefined;
    return dependencies.db.pollBookmarkedEventsForInstallation(owner, query.cursor, query.limit, filters);
  });

  app.patch("/v1/events/:cursor/bookmark", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const { cursor } = z.object({ cursor: z.coerce.number().int().min(1) }).parse(request.params);
    const { bookmarked } = bookmarkBody.parse(request.body);
    if (!dependencies.db.setEventBookmark(owner, cursor, bookmarked, new Date().toISOString())) {
      return reply.status(404).send({ error: "not_found" });
    }
    return reply.status(204).send();
  });

  app.post("/v1/devices", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const body = deviceBody.parse(request.body);
    dependencies.db.registerDevice(owner, body.token, body.platform, new Date().toISOString());
    return reply.status(204).send();
  });

  app.delete("/v1/devices", async (request, reply) => {
    const owner = registeredInstallationId(request, dependencies.db, identity);
    const { token } = deviceBody.pick({ token: true }).parse(request.body);
    if (!dependencies.db.deactivateDeviceForInstallation(token, owner)) {
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
    await dependencies.push.send(subscription.installationId, subscription.id, newEvents);
    return reply.status(202).send({ accepted: body.items.length, created: newEvents.length });
  });

  return app;
}
