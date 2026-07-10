import { resolve } from "node:path";

function int(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  port: int("PORT", 3000),
  host: process.env.HOST ?? "127.0.0.1",
  databasePath: resolve(process.env.DATABASE_PATH ?? "./data/radar.sqlite"),
  pollIntervalSeconds: Math.max(60, int("POLL_INTERVAL_SECONDS", 60)),
  workerTickSeconds: Math.max(1, int("WORKER_TICK_SECONDS", 5)),
  workerConcurrency: Math.max(1, Math.min(20, int("WORKER_CONCURRENCY", 5))),
  ai: {
    url: process.env.AI_API_URL ?? "https://api.openai.com/v1/chat/completions",
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL ?? "gpt-4.1-mini",
  },
  naver: {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    baseUrl: process.env.NAVER_SEARCH_BASE_URL ?? "https://openapi.naver.com/v1/search",
  },
  google: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY,
    engineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
  },
  saramin: {
    accessKey: process.env.SARAMIN_ACCESS_KEY,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  },
  defaultRssFeeds: (process.env.DEFAULT_RSS_FEEDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
