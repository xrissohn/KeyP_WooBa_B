import { resolve } from "node:path";

function int(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeInt(name: string, fallback: number): number {
  return Math.max(0, int(name, fallback));
}

export const config = {
  port: int("PORT", 3000),
  host: process.env.HOST ?? "127.0.0.1",
  databasePath: resolve(process.env.DATABASE_PATH ?? "./data/radar.sqlite"),
  pollIntervalSeconds: Math.max(60, int("POLL_INTERVAL_SECONDS", 60)),
  workerTickSeconds: Math.max(1, int("WORKER_TICK_SECONDS", 5)),
  workerConcurrency: Math.max(1, Math.min(20, int("WORKER_CONCURRENCY", 5))),
  providers: {
    naver: {
      minIntervalSeconds: Math.max(60, int("NAVER_MIN_INTERVAL_SECONDS", 60)),
      dailyBudget: nonNegativeInt("NAVER_DAILY_BUDGET", 24_000),
      budgetTimeZone: process.env.NAVER_BUDGET_TIME_ZONE ?? "Asia/Seoul",
    },
    google: {
      minIntervalSeconds: Math.max(60, int("GOOGLE_MIN_INTERVAL_SECONDS", 900)),
      dailyBudget: nonNegativeInt("GOOGLE_DAILY_BUDGET", 90),
      budgetTimeZone: process.env.GOOGLE_BUDGET_TIME_ZONE ?? "America/Los_Angeles",
    },
    saramin: {
      minIntervalSeconds: Math.max(60, int("SARAMIN_MIN_INTERVAL_SECONDS", 300)),
      dailyBudget: nonNegativeInt("SARAMIN_DAILY_BUDGET", 450),
      budgetTimeZone: process.env.SARAMIN_BUDGET_TIME_ZONE ?? "Asia/Seoul",
    },
    rss: {
      minIntervalSeconds: Math.max(60, int("RSS_MIN_INTERVAL_SECONDS", 300)),
      dailyBudget: nonNegativeInt("RSS_DAILY_BUDGET", 0),
      budgetTimeZone: process.env.RSS_BUDGET_TIME_ZONE ?? "UTC",
    },
  },
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
