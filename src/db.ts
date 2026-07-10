import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CollectedItem, SearchPlan, StoredSubscription } from "./types.js";

type SqliteValue = string | number | bigint | null;

export interface EventPage {
  events: Array<{
    cursor: number;
    subscriptionId: string;
    item: {
      provider: string;
      externalId: string;
      url: string;
      title: string;
      summary?: string;
      publishedAt?: string;
      firstSeenAt: string;
    };
    createdAt: string;
  }>;
  nextCursor: number;
  hasMore: boolean;
}

export interface StoredSourceCache {
  items?: CollectedItem[];
  fetchedAt?: string;
  nextFetchAt: string;
  lastError?: string;
  consecutiveFailures: number;
}

export class AppDatabase {
  readonly sqlite: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        next_run_at TEXT NOT NULL,
        last_run_at TEXT
      );

      CREATE INDEX IF NOT EXISTS subscriptions_due_idx
        ON subscriptions(active, next_run_at);

      CREATE TABLE IF NOT EXISTS source_states (
        subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        source_key TEXT NOT NULL,
        baseline_completed_at TEXT,
        last_successful_at TEXT,
        last_error TEXT,
        PRIMARY KEY(subscription_id, source_key)
      );

      CREATE TABLE IF NOT EXISTS source_cache (
        source_key TEXT PRIMARY KEY,
        source_json TEXT NOT NULL,
        items_json TEXT,
        fetched_at TEXT,
        next_fetch_at TEXT NOT NULL,
        last_error TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS source_cache_due_idx ON source_cache(next_fetch_at);

      CREATE TABLE IF NOT EXISTS provider_usage (
        provider TEXT NOT NULL,
        usage_day TEXT NOT NULL,
        units INTEGER NOT NULL,
        PRIMARY KEY(provider, usage_day)
      );

      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        published_at TEXT,
        first_seen_at TEXT NOT NULL,
        raw_json TEXT,
        UNIQUE(provider, external_id)
      );

      CREATE TABLE IF NOT EXISTS subscription_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        visibility TEXT NOT NULL CHECK(visibility IN ('visible', 'suppressed')),
        created_at TEXT NOT NULL,
        push_sent_at TEXT,
        UNIQUE(subscription_id, item_id)
      );

      CREATE INDEX IF NOT EXISTS subscription_events_poll_idx
        ON subscription_events(subscription_id, visibility, id);

      CREATE TABLE IF NOT EXISTS devices (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id, active);

      CREATE TABLE IF NOT EXISTS push_deliveries (
        event_id INTEGER NOT NULL REFERENCES subscription_events(id) ON DELETE CASCADE,
        token TEXT NOT NULL REFERENCES devices(token) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'invalid')) DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(event_id, token)
      );

      CREATE INDEX IF NOT EXISTS push_deliveries_due_idx
        ON push_deliveries(event_id, status, next_attempt_at);
    `);
  }

  close(): void {
    this.sqlite.close();
  }

  createSubscription(input: {
    id: string;
    userId: string;
    keyword: string;
    plan: SearchPlan;
    webhookSecret: string;
    now: string;
  }): void {
    this.sqlite.prepare(`
      INSERT INTO subscriptions
        (id, user_id, keyword, plan_json, webhook_secret, created_at, next_run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.id, input.userId, input.keyword, JSON.stringify(input.plan), input.webhookSecret, input.now, input.now);
  }

  getSubscription(id: string): StoredSubscription | undefined {
    const row = this.sqlite.prepare(`
      SELECT id, user_id, keyword, plan_json, active, created_at, next_run_at
      FROM subscriptions WHERE id = ? AND active = 1
    `).get(id) as Record<string, SqliteValue> | undefined;

    return row ? this.mapSubscription(row) : undefined;
  }

  listSubscriptions(userId: string): StoredSubscription[] {
    const rows = this.sqlite.prepare(`
      SELECT id, user_id, keyword, plan_json, active, created_at, next_run_at
      FROM subscriptions
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as Array<Record<string, SqliteValue>>;
    return rows.map((row) => this.mapSubscription(row));
  }

  deactivateSubscription(id: string, userId: string): boolean {
    const result = this.sqlite.prepare("UPDATE subscriptions SET active = 0 WHERE id = ? AND user_id = ?")
      .run(id, userId);
    return result.changes === 1;
  }

  setSubscriptionActive(id: string, userId: string, active: boolean, now: string): boolean {
    const result = this.sqlite.prepare(`
      UPDATE subscriptions
      SET active = ?, next_run_at = CASE WHEN ? = 1 THEN ? ELSE next_run_at END
      WHERE id = ? AND user_id = ?
    `).run(active ? 1 : 0, active ? 1 : 0, now, id, userId);
    return result.changes === 1;
  }

  getWebhookSecret(id: string): string | undefined {
    const row = this.sqlite.prepare("SELECT webhook_secret FROM subscriptions WHERE id = ? AND active = 1")
      .get(id) as { webhook_secret: string } | undefined;
    return row?.webhook_secret;
  }

  listDueSubscriptions(now: string, limit = 100): StoredSubscription[] {
    const rows = this.sqlite.prepare(`
      SELECT id, user_id, keyword, plan_json, active, created_at, next_run_at
      FROM subscriptions
      WHERE active = 1 AND next_run_at <= ?
      ORDER BY next_run_at ASC LIMIT ?
    `).all(now, limit) as Array<Record<string, SqliteValue>>;
    return rows.map((row) => this.mapSubscription(row));
  }

  scheduleNext(subscriptionId: string, nextRunAt: string, lastRunAt: string): void {
    this.sqlite.prepare(`
      UPDATE subscriptions SET next_run_at = ?, last_run_at = ? WHERE id = ?
    `).run(nextRunAt, lastRunAt, subscriptionId);
  }

  getSourceState(subscriptionId: string, sourceKey: string): {
    baselineCompletedAt?: string;
    lastSuccessfulAt?: string;
  } {
    const row = this.sqlite.prepare(`
      SELECT baseline_completed_at, last_successful_at
      FROM source_states WHERE subscription_id = ? AND source_key = ?
    `).get(subscriptionId, sourceKey) as {
      baseline_completed_at: string | null;
      last_successful_at: string | null;
    } | undefined;
    return {
      baselineCompletedAt: row?.baseline_completed_at ?? undefined,
      lastSuccessfulAt: row?.last_successful_at ?? undefined,
    };
  }

  markSourceSuccess(subscriptionId: string, sourceKey: string, now: string, baseline: boolean): void {
    this.sqlite.prepare(`
      INSERT INTO source_states
        (subscription_id, source_key, baseline_completed_at, last_successful_at, last_error)
      VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(subscription_id, source_key) DO UPDATE SET
        baseline_completed_at = COALESCE(source_states.baseline_completed_at, excluded.baseline_completed_at),
        last_successful_at = excluded.last_successful_at,
        last_error = NULL
    `).run(subscriptionId, sourceKey, baseline ? now : null, now);
  }

  markSourceError(subscriptionId: string, sourceKey: string, error: string): void {
    this.sqlite.prepare(`
      INSERT INTO source_states(subscription_id, source_key, last_error)
      VALUES (?, ?, ?)
      ON CONFLICT(subscription_id, source_key) DO UPDATE SET last_error = excluded.last_error
    `).run(subscriptionId, sourceKey, error.slice(0, 1000));
  }

  getSourceCache(sourceKey: string): StoredSourceCache | undefined {
    const row = this.sqlite.prepare(`
      SELECT items_json, fetched_at, next_fetch_at, last_error, consecutive_failures
      FROM source_cache WHERE source_key = ?
    `).get(sourceKey) as Record<string, SqliteValue> | undefined;
    if (!row) return undefined;
    return {
      items: row.items_json ? JSON.parse(String(row.items_json)) as CollectedItem[] : undefined,
      fetchedAt: row.fetched_at ? String(row.fetched_at) : undefined,
      nextFetchAt: String(row.next_fetch_at),
      lastError: row.last_error ? String(row.last_error) : undefined,
      consecutiveFailures: Number(row.consecutive_failures),
    };
  }

  recordSourceCacheSuccess(input: {
    sourceKey: string;
    source: object;
    items: CollectedItem[];
    fetchedAt: string;
    nextFetchAt: string;
  }): void {
    this.sqlite.prepare(`
      INSERT INTO source_cache
        (source_key, source_json, items_json, fetched_at, next_fetch_at, last_error, consecutive_failures)
      VALUES (?, ?, ?, ?, ?, NULL, 0)
      ON CONFLICT(source_key) DO UPDATE SET
        source_json = excluded.source_json,
        items_json = excluded.items_json,
        fetched_at = excluded.fetched_at,
        next_fetch_at = excluded.next_fetch_at,
        last_error = NULL,
        consecutive_failures = 0
    `).run(
      input.sourceKey,
      JSON.stringify(input.source),
      JSON.stringify(input.items),
      input.fetchedAt,
      input.nextFetchAt,
    );
  }

  recordSourceCacheFailure(input: {
    sourceKey: string;
    source: object;
    error: string;
    nextFetchAt: string;
  }): void {
    this.sqlite.prepare(`
      INSERT INTO source_cache
        (source_key, source_json, next_fetch_at, last_error, consecutive_failures)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(source_key) DO UPDATE SET
        source_json = excluded.source_json,
        next_fetch_at = excluded.next_fetch_at,
        last_error = excluded.last_error,
        consecutive_failures = source_cache.consecutive_failures + 1
    `).run(input.sourceKey, JSON.stringify(input.source), input.nextFetchAt, input.error.slice(0, 1000));
  }

  tryConsumeProviderBudget(provider: string, usageDay: string, units: number, dailyLimit: number): boolean {
    if (dailyLimit === 0) return true;
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const row = this.sqlite.prepare(`
        SELECT units FROM provider_usage WHERE provider = ? AND usage_day = ?
      `).get(provider, usageDay) as { units: number } | undefined;
      if ((row?.units ?? 0) + units > dailyLimit) {
        this.sqlite.exec("ROLLBACK");
        return false;
      }
      this.sqlite.prepare(`
        INSERT INTO provider_usage(provider, usage_day, units) VALUES (?, ?, ?)
        ON CONFLICT(provider, usage_day) DO UPDATE SET units = provider_usage.units + excluded.units
      `).run(provider, usageDay, units);
      this.sqlite.exec("COMMIT");
      return true;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  getProviderUsage(provider: string, usageDay: string): number {
    const row = this.sqlite.prepare(`
      SELECT units FROM provider_usage WHERE provider = ? AND usage_day = ?
    `).get(provider, usageDay) as { units: number } | undefined;
    return row?.units ?? 0;
  }

  storeItemAndEvent(input: {
    subscriptionId: string;
    item: CollectedItem;
    canonicalUrl: string;
    visible: boolean;
    now: string;
  }): { inserted: boolean; eventId?: number } {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare(`
        INSERT INTO items
          (provider, external_id, canonical_url, title, summary, published_at, first_seen_at, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, external_id) DO UPDATE SET
          canonical_url = excluded.canonical_url,
          title = excluded.title,
          summary = excluded.summary,
          published_at = COALESCE(excluded.published_at, items.published_at),
          raw_json = excluded.raw_json
      `).run(
        input.item.provider,
        input.item.externalId,
        input.canonicalUrl,
        input.item.title,
        input.item.summary ?? null,
        input.item.publishedAt ?? null,
        input.now,
        input.item.raw === undefined ? null : JSON.stringify(input.item.raw),
      );

      const itemRow = this.sqlite.prepare("SELECT id FROM items WHERE provider = ? AND external_id = ?")
        .get(input.item.provider, input.item.externalId) as { id: number };
      const result = this.sqlite.prepare(`
        INSERT OR IGNORE INTO subscription_events(subscription_id, item_id, visibility, created_at)
        VALUES (?, ?, ?, ?)
      `).run(input.subscriptionId, itemRow.id, input.visible ? "visible" : "suppressed", input.now);
      this.sqlite.exec("COMMIT");
      return result.changes === 1
        ? { inserted: true, eventId: Number(result.lastInsertRowid) }
        : { inserted: false };
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  pollEvents(subscriptionId: string, cursor: number, limit: number): EventPage {
    const rows = this.sqlite.prepare(`
      SELECT
        e.id, e.subscription_id, e.created_at,
        i.provider, i.external_id, i.canonical_url, i.title, i.summary,
        i.published_at, i.first_seen_at
      FROM subscription_events e
      JOIN items i ON i.id = e.item_id
      WHERE e.subscription_id = ? AND e.visibility = 'visible' AND e.id > ?
      ORDER BY e.id ASC LIMIT ?
    `).all(subscriptionId, cursor, limit + 1) as Array<Record<string, SqliteValue>>;

    return this.mapEventPage(rows, cursor, limit);
  }

  pollEventsForUser(userId: string, cursor: number, limit: number): EventPage {
    const rows = this.sqlite.prepare(`
      SELECT
        e.id, e.subscription_id, e.created_at,
        i.provider, i.external_id, i.canonical_url, i.title, i.summary,
        i.published_at, i.first_seen_at
      FROM subscription_events e
      JOIN subscriptions s ON s.id = e.subscription_id
      JOIN items i ON i.id = e.item_id
      WHERE s.user_id = ? AND e.visibility = 'visible' AND e.id > ?
      ORDER BY e.id ASC LIMIT ?
    `).all(userId, cursor, limit + 1) as Array<Record<string, SqliteValue>>;
    return this.mapEventPage(rows, cursor, limit);
  }

  private mapEventPage(rows: Array<Record<string, SqliteValue>>, cursor: number, limit: number): EventPage {
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const events = pageRows.map((row) => ({
      cursor: Number(row.id),
      subscriptionId: String(row.subscription_id),
      item: {
        provider: String(row.provider),
        externalId: String(row.external_id),
        url: String(row.canonical_url),
        title: String(row.title),
        summary: row.summary ? String(row.summary) : undefined,
        publishedAt: row.published_at ? String(row.published_at) : undefined,
        firstSeenAt: String(row.first_seen_at),
      },
      createdAt: String(row.created_at),
    }));
    return {
      events,
      nextCursor: events.at(-1)?.cursor ?? cursor,
      hasMore,
    };
  }

  registerDevice(userId: string, token: string, platform: string, now: string): void {
    this.sqlite.prepare(`
      INSERT INTO devices(token, user_id, platform, active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        user_id = excluded.user_id,
        platform = excluded.platform,
        active = 1,
        updated_at = excluded.updated_at
    `).run(token, userId, platform, now, now);
  }

  getDeviceTokens(userId: string): string[] {
    const rows = this.sqlite.prepare("SELECT token FROM devices WHERE user_id = ? AND active = 1")
      .all(userId) as Array<{ token: string }>;
    return rows.map((row) => row.token);
  }

  deactivateDevice(token: string): void {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare("UPDATE devices SET active = 0 WHERE token = ?").run(token);
      this.sqlite.prepare(`
        UPDATE push_deliveries
        SET status = 'invalid', last_error = 'device token deactivated', updated_at = ?
        WHERE token = ? AND status = 'pending'
      `).run(new Date().toISOString(), token);
      this.markCompletedPushEvents();
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  deactivateDeviceForUser(token: string, userId: string): boolean {
    const row = this.sqlite.prepare("SELECT user_id FROM devices WHERE token = ? AND active = 1")
      .get(token) as { user_id: string } | undefined;
    if (!row || row.user_id !== userId) return false;
    this.deactivateDevice(token);
    return true;
  }

  markPushSent(eventIds: number[], now: string): void {
    const statement = this.sqlite.prepare("UPDATE subscription_events SET push_sent_at = ? WHERE id = ?");
    for (const id of eventIds) statement.run(now, id);
  }

  ensurePushDeliveries(eventId: number, tokens: string[], now: string): void {
    const statement = this.sqlite.prepare(`
      INSERT OR IGNORE INTO push_deliveries
        (event_id, token, status, attempts, next_attempt_at, updated_at)
      VALUES (?, ?, 'pending', 0, ?, ?)
    `);
    for (const token of tokens) statement.run(eventId, token, now, now);
  }

  getDuePushTokens(eventId: number, now: string, limit = 500): string[] {
    const rows = this.sqlite.prepare(`
      SELECT token FROM push_deliveries
      WHERE event_id = ? AND status = 'pending' AND next_attempt_at <= ?
      ORDER BY token LIMIT ?
    `).all(eventId, now, limit) as Array<{ token: string }>;
    return rows.map((row) => row.token);
  }

  markPushDelivery(input: {
    eventId: number;
    token: string;
    status: "sent" | "invalid" | "pending";
    now: string;
    nextAttemptAt?: string;
    error?: string;
  }): void {
    this.sqlite.prepare(`
      UPDATE push_deliveries SET
        status = ?,
        attempts = attempts + 1,
        next_attempt_at = ?,
        last_error = ?,
        updated_at = ?
      WHERE event_id = ? AND token = ?
    `).run(
      input.status,
      input.nextAttemptAt ?? input.now,
      input.error?.slice(0, 1000) ?? null,
      input.now,
      input.eventId,
      input.token,
    );
  }

  completePushEventIfDelivered(eventId: number, now: string): boolean {
    const result = this.sqlite.prepare(`
      UPDATE subscription_events SET push_sent_at = ?
      WHERE id = ? AND push_sent_at IS NULL
        AND EXISTS (SELECT 1 FROM push_deliveries WHERE event_id = ?)
        AND NOT EXISTS (
          SELECT 1 FROM push_deliveries WHERE event_id = ? AND status = 'pending'
        )
    `).run(now, eventId, eventId, eventId);
    return result.changes === 1;
  }

  private markCompletedPushEvents(): void {
    this.sqlite.prepare(`
      UPDATE subscription_events SET push_sent_at = COALESCE(push_sent_at, ?)
      WHERE push_sent_at IS NULL
        AND EXISTS (SELECT 1 FROM push_deliveries WHERE event_id = subscription_events.id)
        AND NOT EXISTS (
          SELECT 1 FROM push_deliveries
          WHERE event_id = subscription_events.id AND status = 'pending'
        )
    `).run(new Date().toISOString());
  }

  getPendingPushEvents(subscriptionId: string, limit = 100): Array<{ eventId: number; item: CollectedItem }> {
    const rows = this.sqlite.prepare(`
      SELECT
        e.id, i.provider, i.external_id, i.canonical_url, i.title,
        i.summary, i.published_at, i.raw_json
      FROM subscription_events e
      JOIN items i ON i.id = e.item_id
      WHERE e.subscription_id = ?
        AND e.visibility = 'visible'
        AND e.push_sent_at IS NULL
      ORDER BY e.id ASC LIMIT ?
    `).all(subscriptionId, limit) as Array<Record<string, SqliteValue>>;
    return rows.map((row) => ({
      eventId: Number(row.id),
      item: {
        provider: String(row.provider),
        externalId: String(row.external_id),
        url: String(row.canonical_url),
        title: String(row.title),
        summary: row.summary ? String(row.summary) : undefined,
        publishedAt: row.published_at ? String(row.published_at) : undefined,
        raw: row.raw_json ? JSON.parse(String(row.raw_json)) : undefined,
      },
    }));
  }

  private mapSubscription(row: Record<string, SqliteValue>): StoredSubscription {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      keyword: String(row.keyword),
      plan: JSON.parse(String(row.plan_json)) as SearchPlan,
      active: Number(row.active) === 1,
      createdAt: String(row.created_at),
      nextRunAt: String(row.next_run_at),
    };
  }
}
