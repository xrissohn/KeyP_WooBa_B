import { config } from "./config.js";
import { fetchJson } from "./http.js";
import { searchPlanSchema, type SearchPlan, type SourcePlan } from "./types.js";

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
      minItems: 2,
      maxItems: 12,
      items: {
        anyOf: [
          {
            type: "object", additionalProperties: false, required: ["provider", "query", "vertical"],
            properties: { provider: { type: "string", const: "naver" }, query: { type: "string" }, vertical: { type: "string", enum: ["news", "blog", "webkr"] } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "query"],
            properties: { provider: { type: "string", const: "x" }, query: { type: "string" } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "url", "query"],
            properties: { provider: { type: "string", const: "rss" }, url: { type: "string" }, query: { type: "string" } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "query"],
            properties: { provider: { type: "string", const: "ai_search" }, query: { type: "string" } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "query"],
            properties: { provider: { type: "string", const: "serpapi" }, query: { type: "string" } },
          },
          {
            type: "object", additionalProperties: false, required: ["provider", "query"],
            properties: { provider: { type: "string", const: "youtube" }, query: { type: "string" } },
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
    if (this.enabledProviders().length === 0) {
      return { plan: this.fallback(keyword), mode: "fallback", fallbackReason: "No external search provider is configured" };
    }
    try {
      const enabledRss = config.defaultRssFeeds.join(", ") || "none";
      const enabledProviders = this.enabledProviders().join(", ") || "webhook only";
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
                `Enabled providers: ${enabledProviders}. Do not select disabled providers.`,
                "Use X for timely public discussion, reactions, and first-hand posts.",
                "Use ai_search for current web-grounded AI research and source discovery.",
                "Use serpapi for broad web discovery and youtube only when video content is relevant.",
                "Use RSS only with one of the explicitly allowed URLs.",
                "Decompose the intent into 2-6 distinct, narrow queries while preserving every mandatory constraint.",
                "Do not broaden a query by dropping required people, locations, technologies, dates, or event types.",
                "Prefer short literal queries; do not invent facts or URLs. Avoid duplicate provider/query pairs.",
                `Allowed RSS URLs: ${enabledRss}`,
              ].join(" "),
            },
            { role: "user", content: keyword },
          ],
        }),
      });
      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new Error("AI response did not contain a plan");
      const plan = this.withEnabledSources(searchPlanSchema.parse(JSON.parse(content)));
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
    const sources: SearchPlan["sources"] = [];
    if (config.naver.clientId && config.naver.clientSecret) {
      sources.push({ provider: "naver", vertical: "news", query: cleaned });
    }
    if (config.x.bearerToken) sources.push({ provider: "x", query: cleaned });
    if (this.hasAiSearchEngine()) sources.push({ provider: "ai_search", query: cleaned });
    if (config.serpapi.key) sources.push({ provider: "serpapi", query: cleaned });
    if (config.youtube.key && /(유튜브|youtube|영상|인터뷰|강의|리뷰)/i.test(cleaned)) {
      sources.push({ provider: "youtube", query: cleaned });
    }
    for (const url of config.defaultRssFeeds.slice(0, 5)) {
      sources.push({ provider: "rss", url, query: cleaned });
    }
    if (sources.length === 0) sources.push({ provider: "webhook", name: "default" });
    return searchPlanSchema.parse({
      topic: isJob ? "employment" : "general",
      normalizedKeywords: tokens.length > 0 ? tokens : [cleaned],
      intervalSeconds: config.pollIntervalSeconds,
      sources,
    });
  }

  private enabledProviders(): SourcePlan["provider"][] {
    const providers: SourcePlan["provider"][] = [];
    if (config.naver.clientId && config.naver.clientSecret) providers.push("naver");
    if (config.x.bearerToken) providers.push("x");
    if (config.defaultRssFeeds.length > 0) providers.push("rss");
    if (this.hasAiSearchEngine()) providers.push("ai_search");
    if (config.serpapi.key) providers.push("serpapi");
    if (config.youtube.key) providers.push("youtube");
    return providers;
  }

  private hasAiSearchEngine(): boolean {
    return config.aiSearch.engines.some((engine) => {
      if (engine === "perplexity") return Boolean(config.aiSearch.perplexity.key);
      if (engine === "gemini") return Boolean(config.aiSearch.gemini.key);
      if (engine === "xai") return Boolean(config.aiSearch.xai.key);
      return false;
    });
  }

  private withEnabledSources(plan: SearchPlan): SearchPlan {
    const enabled = new Set(this.enabledProviders());
    const seen = new Set<string>();
    const sources = plan.sources.filter((source) => {
      if (!enabled.has(source.provider)) return false;
      const key = JSON.stringify(source);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (sources.length === 0) throw new Error("AI plan did not contain an enabled provider");
    return searchPlanSchema.parse({ ...plan, intervalSeconds: config.pollIntervalSeconds, sources });
  }
}
