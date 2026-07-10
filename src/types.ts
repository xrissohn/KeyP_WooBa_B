import { z } from "zod";

export const sourcePlanSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("naver"),
    query: z.string().min(1).max(300),
    vertical: z.enum(["news", "blog", "webkr"]).default("news"),
  }),
  z.object({
    provider: z.literal("x"),
    query: z.string().min(1).max(300),
  }),
  z.object({
    provider: z.literal("rss"),
    url: z.string().url(),
    query: z.string().min(1).max(300).optional(),
  }),
  z.object({
    provider: z.literal("ai_search"),
    query: z.string().min(1).max(300),
  }),
  z.object({
    provider: z.literal("serpapi"),
    query: z.string().min(1).max(300),
  }),
  z.object({
    provider: z.literal("youtube"),
    query: z.string().min(1).max(300),
  }),
  z.object({
    provider: z.literal("webhook"),
    name: z.string().min(1).max(80),
  }),
]);

export const searchPlanSchema = z.object({
  topic: z.string().min(1).max(80),
  normalizedKeywords: z.array(z.string().min(1).max(80)).min(1).max(20),
  intervalSeconds: z.number().int().min(60).max(86400).default(60),
  sources: z.array(sourcePlanSchema).min(1).max(12),
});

export type SourcePlan = z.infer<typeof sourcePlanSchema>;
export type SearchPlan = z.infer<typeof searchPlanSchema>;

export const itemReviewSchema = z.object({
  accepted: z.boolean(),
  relevanceScore: z.number().int().min(0).max(100),
  credibilityScore: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(500),
  signals: z.array(z.string().min(1).max(100)).max(8).default([]),
  model: z.string().min(1).max(100),
});

export type ItemReview = z.infer<typeof itemReviewSchema>;

export interface CollectedItem {
  provider: string;
  externalId: string;
  url: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  raw?: unknown;
}

export interface SourceContext {
  subscriptionId: string;
  subscriptionCreatedAt: string;
  lastSuccessfulAt?: string;
  now: Date;
}

export interface Connector {
  collect(source: SourcePlan, context: SourceContext): Promise<CollectedItem[]>;
}

export interface StoredSubscription {
  id: string;
  installationId: string;
  keyword: string;
  plan: SearchPlan;
  active: boolean;
  createdAt: string;
  baselineCompletedAt?: string;
  nextRunAt: string;
}
