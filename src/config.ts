import { resolve } from "node:path";

function int(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeInt(name: string, fallback: number): number {
  return Math.max(0, int(name, fallback));
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function appRole(): "all" | "api" | "worker" {
  const value = process.env.APP_ROLE ?? "all";
  return value === "api" || value === "worker" ? value : "all";
}

function csv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export const config = {
  appRole: appRole(),
  port: int("PORT", 3000),
  host: process.env.HOST ?? "127.0.0.1",
  databasePath: resolve(process.env.DATABASE_PATH ?? "./data/radar.sqlite"),
  pollIntervalSeconds: Math.max(60, int("POLL_INTERVAL_SECONDS", 60)),
  workerTickSeconds: Math.max(1, int("WORKER_TICK_SECONDS", 5)),
  workerConcurrency: Math.max(1, Math.min(20, int("WORKER_CONCURRENCY", 5))),
  schedulerLeaseSeconds: Math.max(30, int("SCHEDULER_LEASE_SECONDS", 300)),
  providers: {
    naver: {
      minIntervalSeconds: Math.max(60, int("NAVER_MIN_INTERVAL_SECONDS", 60)),
      dailyBudget: nonNegativeInt("NAVER_DAILY_BUDGET", 24_000),
      budgetTimeZone: process.env.NAVER_BUDGET_TIME_ZONE ?? "Asia/Seoul",
    },
    x: {
      minIntervalSeconds: Math.max(60, int("X_MIN_INTERVAL_SECONDS", 60)),
      dailyBudget: nonNegativeInt("X_DAILY_BUDGET", 450),
      budgetTimeZone: process.env.X_BUDGET_TIME_ZONE ?? "UTC",
    },
    rss: {
      minIntervalSeconds: Math.max(60, int("RSS_MIN_INTERVAL_SECONDS", 300)),
      dailyBudget: nonNegativeInt("RSS_DAILY_BUDGET", 0),
      budgetTimeZone: process.env.RSS_BUDGET_TIME_ZONE ?? "UTC",
    },
    ai_search: {
      minIntervalSeconds: Math.max(60, int("AI_SEARCH_MIN_INTERVAL_SECONDS", 300)),
      dailyBudget: nonNegativeInt("AI_SEARCH_DAILY_BUDGET", 500),
      budgetTimeZone: process.env.AI_SEARCH_BUDGET_TIME_ZONE ?? "UTC",
    },
    serpapi: {
      minIntervalSeconds: Math.max(60, int("SERPAPI_MIN_INTERVAL_SECONDS", 300)),
      dailyBudget: nonNegativeInt("SERPAPI_DAILY_BUDGET", 100),
      budgetTimeZone: process.env.SERPAPI_BUDGET_TIME_ZONE ?? "UTC",
    },
    youtube: {
      minIntervalSeconds: Math.max(60, int("YOUTUBE_MIN_INTERVAL_SECONDS", 300)),
      dailyBudget: nonNegativeInt("YOUTUBE_DAILY_BUDGET", 100),
      budgetTimeZone: process.env.YOUTUBE_BUDGET_TIME_ZONE ?? "America/Los_Angeles",
    },
  },
  ai: {
    url: process.env.AI_API_URL ?? "https://api.openai.com/v1/chat/completions",
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL ?? "gpt-4.1-mini",
  },
  aiReview: {
    enabled: bool("AI_REVIEW_ENABLED", Boolean(process.env.AI_API_KEY)),
    required: bool("AI_REVIEW_REQUIRED", process.env.NODE_ENV === "production"),
    relevanceThreshold: Math.min(100, Math.max(0, int("AI_RELEVANCE_THRESHOLD", 70))),
    credibilityThreshold: Math.min(100, Math.max(0, int("AI_CREDIBILITY_THRESHOLD", 55))),
    batchSize: Math.min(20, Math.max(1, int("AI_REVIEW_BATCH_SIZE", 15))),
  },
  aiSearch: {
    engines: csv("AI_SEARCH_ENGINES", "perplexity,gemini,xai"),
    perplexity: {
      key: process.env.PERPLEXITY_API_KEY,
      url: process.env.PERPLEXITY_API_URL ?? "https://api.perplexity.ai/v1/sonar",
      model: process.env.PERPLEXITY_MODEL ?? "sonar",
    },
    gemini: {
      key: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY,
      baseUrl: process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/models",
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    },
    xai: {
      key: process.env.XAI_API_KEY,
      url: process.env.XAI_API_URL ?? "https://api.x.ai/v1/responses",
      model: process.env.XAI_MODEL ?? "grok-4.5",
    },
  },
  serpapi: {
    key: process.env.SERPAPI_API_KEY,
    url: process.env.SERPAPI_API_URL ?? "https://serpapi.com/search.json",
  },
  youtube: {
    key: process.env.YOUTUBE_API_KEY,
    url: process.env.YOUTUBE_API_URL ?? "https://www.googleapis.com/youtube/v3/search",
  },
  naver: {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    baseUrl: process.env.NAVER_SEARCH_BASE_URL ?? "https://openapi.naver.com/v1/search",
  },
  x: {
    bearerToken: process.env.X_BEARER_TOKEN,
    baseUrl: process.env.X_SEARCH_BASE_URL ?? "https://api.x.com/2/tweets/search/recent",
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    appCheckEnforced: bool("FIREBASE_APP_CHECK_ENFORCED", false),
    installationIdentityEnabled: bool("FIREBASE_INSTALLATION_IDENTITY_ENABLED", false),
    anonymousInstallationId: process.env.ANONYMOUS_INSTALLATION_ID ?? "temporary-anonymous-installation",
  },
  defaultRssFeeds: csv("DEFAULT_RSS_FEEDS", ""),
};
