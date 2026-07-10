import { config } from "./config.js";
import { fetchJson } from "./http.js";
import { searchPlanSchema, type SearchPlan } from "./types.js";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "normalizedKeywords", "intervalSeconds", "sources"],
  properties: {
    topic: { type: "string" },
    normalizedKeywords: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
    intervalSeconds: { type: "integer", minimum: 60, maximum: 86400 },
    sources: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        oneOf: [
          {
            type: "object", additionalProperties: false, required: ["provider", "query", "vertical"],
            properties: { provider: { const: "naver" }, query: { type: "string" }, vertical: { enum: ["news", "blog", "webkr"] } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "query"],
            properties: { provider: { const: "google" }, query: { type: "string" } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "query"],
            properties: { provider: { const: "saramin" }, query: { type: "string" } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "url", "query"],
            properties: { provider: { const: "rss" }, url: { type: "string" }, query: { type: "string" } },
          },
        ],
      },
    },
  },
} as const;

export interface PlannerResult {
  plan: SearchPlan;
  mode: "ai" | "fallback";
  fallbackReason?: string;
}

export class SearchPlanner {
  async create(keyword: string): Promise<PlannerResult> {
    if (!config.ai.key) return { plan: this.fallback(keyword), mode: "fallback", fallbackReason: "AI_API_KEY is not configured" };
    try {
      const enabledRss = config.defaultRssFeeds.join(", ") || "none";
      const response = await fetchJson<ChatResponse>(config.ai.url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.ai.key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: config.ai.model,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: { name: "search_plan", strict: true, schema: PLAN_JSON_SCHEMA },
          },
          messages: [
            {
              role: "system",
              content: [
                "Convert a Korean user's monitoring interest into a conservative search plan.",
                "Use only the providers in the schema.",
                "Use saramin only for employment or recruiting intent.",
                "Use RSS only with one of the explicitly allowed URLs.",
                "Prefer short literal queries; do not invent facts or URLs.",
                `Allowed RSS URLs: ${enabledRss}`,
              ].join(" "),
            },
            { role: "user", content: keyword },
          ],
        }),
      });
      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new Error("AI response did not contain a plan");
      const plan = searchPlanSchema.parse(JSON.parse(content));
      const allowedFeeds = new Set(config.defaultRssFeeds);
      if (plan.sources.some((source) => source.provider === "rss" && !allowedFeeds.has(source.url))) {
        throw new Error("AI selected an RSS URL outside DEFAULT_RSS_FEEDS");
      }
      return { plan, mode: "ai" };
    } catch (error) {
      return {
        plan: this.fallback(keyword),
        mode: "fallback",
        fallbackReason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  fallback(keyword: string): SearchPlan {
    const cleaned = keyword.trim().replace(/\s+/g, " ").slice(0, 300);
    const isJob = /(채용|취업|구인|직무|개발자|엔지니어|인턴|경력직)/i.test(cleaned);
    const tokens = cleaned.split(/[\s,]+/).filter((token) => token.length > 1).slice(0, 12);
    const sources: SearchPlan["sources"] = [
      { provider: "naver", vertical: "news", query: cleaned },
      { provider: "google", query: cleaned },
    ];
    if (isJob) sources.push({ provider: "saramin", query: cleaned });
    for (const url of config.defaultRssFeeds.slice(0, 5)) {
      sources.push({ provider: "rss", url, query: cleaned });
    }
    return searchPlanSchema.parse({
      topic: isJob ? "employment" : "general",
      normalizedKeywords: tokens.length > 0 ? tokens : [cleaned],
      intervalSeconds: config.pollIntervalSeconds,
      sources,
    });
  }
}
