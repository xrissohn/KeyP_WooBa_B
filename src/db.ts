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
      SELECT id, user_id, keyword, plan_json, created_at, next_run_at
      FROM subscriptions WHERE id = ? AND active = 1
    `).get(id) as Record<string, SqliteValue> | undefined;

    return row ? this.mapSubscription(row) : undefined;
  }

  deactivateSubscription(id: string, userId: string): boolean {
    const result = this.sqlite.prepare("UPDATE subscriptions SET active = 0 WHERE id = ? AND user_id = ?")
      .run(id, userId);
    return result.changes === 1;
  }

  getWebhookSecret(id: string): string | undefined {
    const row = this.sqlite.prepare("SELECT webhook_secret FROM subscriptions WHERE id = ? AND active = 1")
      .get(id) as { webhook_secret: string } | undefined;
    return row?.webhook_secret;
  }

  listDueSubscriptions(now: string, limit = 100): StoredSubscription[] {
    const rows = this.sqlite.prepare(`
      SELECT id, user_id, keyword, plan_json, created_at, next_run_at
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
    this.sqlite.prepare("UPDATE devices SET active = 0 WHERE token = ?").run(token);
  }

  markPushSent(eventIds: number[], now: string): void {
    const statement = this.sqlite.prepare("UPDATE subscription_events SET push_sent_at = ? WHERE id = ?");
    for (const id of eventIds) statement.run(now, id);
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
      createdAt: String(row.created_at),
      nextRunAt: String(row.next_run_at),
    };
  }
}
