import { z } from "zod";
import { config } from "./config.js";
import { fetchJson } from "./http.js";
import type { CollectedItem, ItemReview, StoredSubscription } from "./types.js";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const decisionSchema = z.object({
  decisions: z.array(z.object({
    itemIndex: z.number().int().min(0),
    relevant: z.boolean(),
    relevanceScore: z.number().int().min(0).max(100),
    credibilityScore: z.number().int().min(0).max(100),
    reason: z.string().min(1).max(500),
    signals: z.array(z.string().min(1).max(100)).max(8),
  })),
});

const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemIndex", "relevant", "relevanceScore", "credibilityScore", "reason", "signals"],
        properties: {
          itemIndex: { type: "integer", minimum: 0 },
          relevant: { type: "boolean" },
          relevanceScore: { type: "integer", minimum: 0, maximum: 100 },
          credibilityScore: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
          signals: { type: "array", maxItems: 8, items: { type: "string" } },
        },
      },
    },
  },
} as const;

export interface ItemReviewer {
  review(subscription: StoredSubscription, items: CollectedItem[]): Promise<ItemReview[]>;
}

export class AiItemReviewer implements ItemReviewer {
  constructor(private readonly options: {
    api: typeof config.ai;
    review: typeof config.aiReview;
  } = { api: config.ai, review: config.aiReview }) {}

  async review(subscription: StoredSubscription, items: CollectedItem[]): Promise<ItemReview[]> {
    if (items.length === 0) return [];
    if (!this.options.review.enabled || !this.options.api.key) {
      if (this.options.review.required) throw new Error("AI review is required but AI_API_KEY is not configured");
      return items.map(() => ({
        accepted: true,
        relevanceScore: 100,
        credibilityScore: 100,
        reason: "AI review is disabled",
        signals: ["review-disabled"],
        model: "disabled",
      }));
    }

    const reviews: ItemReview[] = [];
    for (let offset = 0; offset < items.length; offset += this.options.review.batchSize) {
      const batch = items.slice(offset, offset + this.options.review.batchSize);
      reviews.push(...await this.reviewBatch(subscription, batch));
    }
    return reviews;
  }

  private async reviewBatch(subscription: StoredSubscription, items: CollectedItem[]): Promise<ItemReview[]> {
    const response = await fetchJson<ChatResponse>(this.options.api.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.api.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.options.api.model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: "interest_item_review", strict: true, schema: REVIEW_JSON_SCHEMA },
        },
        messages: [
          {
            role: "system",
            content: [
              "Evaluate monitoring candidates against the user's original intent.",
              "Mandatory people, organizations, locations, technologies, dates, and event types must all match.",
              "Relevance score measures intent match, not keyword overlap.",
              "Credibility score estimates source reliability from the provider, URL domain, title, snippet, recency, and whether it appears primary or official.",
              "Do not claim that a fact is verified when the supplied evidence is insufficient.",
              "Official and primary sources are strongest; established reporting is stronger than unattributed aggregation.",
              "Anonymous social claims, rumors, clickbait, and content without a checkable source should score low.",
              "Return exactly one decision for every itemIndex and no additional items.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              originalIntent: subscription.keyword,
              topic: subscription.plan.topic,
              normalizedKeywords: subscription.plan.normalizedKeywords,
              items: items.map((item, itemIndex) => ({
                itemIndex,
                provider: item.provider,
                url: item.url,
                title: item.title,
                summary: item.summary,
                publishedAt: item.publishedAt,
              })),
            }),
          },
        ],
      }),
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI review response did not contain decisions");
    const parsed = decisionSchema.parse(JSON.parse(content));
    const byIndex = new Map(parsed.decisions.map((decision) => [decision.itemIndex, decision]));
    if (byIndex.size !== items.length || items.some((_, index) => !byIndex.has(index))) {
      throw new Error("AI review response did not cover every candidate exactly once");
    }
    return items.map((_, index) => {
      const decision = byIndex.get(index) as z.infer<typeof decisionSchema>["decisions"][number];
      return {
        accepted: decision.relevant
          && decision.relevanceScore >= this.options.review.relevanceThreshold
          && decision.credibilityScore >= this.options.review.credibilityThreshold,
        relevanceScore: decision.relevanceScore,
        credibilityScore: decision.credibilityScore,
        reason: decision.reason,
        signals: decision.signals,
        model: this.options.api.model,
      };
    });
  }
}
