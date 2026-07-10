import { config } from "../config.js";
import { fetchJson } from "../http.js";
import type { CollectedItem, Connector, SourcePlan } from "../types.js";
import { stableId, stripHtml } from "../util.js";

interface SearchHit {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

interface PerplexityResponse {
  search_results?: Array<{
    title?: string;
    url?: string;
    date?: string;
    last_updated?: string;
    snippet?: string;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
}

interface XaiResponse {
  output?: Array<{
    content?: Array<{
      text?: string;
      annotations?: Array<{ url?: string; title?: string }>;
    }>;
  }>;
  citations?: Array<string | { url?: string; title?: string }>;
}

function timestamp(value: string | undefined): string | undefined {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function unique(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    try {
      new URL(hit.url);
    } catch {
      return false;
    }
    if (seen.has(hit.url)) return false;
    seen.add(hit.url);
    return true;
  });
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "Web source";
  }
}

export class AiSearchConnector implements Connector {
  constructor(private readonly options = config.aiSearch) {}

  async collect(source: SourcePlan): Promise<CollectedItem[]> {
    if (source.provider !== "ai_search") return [];
    const failures: string[] = [];
    for (const engine of this.options.engines) {
      try {
        const hits = engine === "perplexity"
          ? await this.perplexity(source.query)
          : engine === "gemini"
            ? await this.gemini(source.query)
            : engine === "xai"
              ? await this.xai(source.query)
              : undefined;
        if (!hits) continue;
        if (hits.length === 0) {
          failures.push(`${engine}: no grounded search results`);
          continue;
        }
        return unique(hits).map((hit) => ({
          provider: `ai_search:${engine}`,
          externalId: stableId(hit.url),
          url: hit.url,
          title: stripHtml(hit.title).slice(0, 500),
          summary: hit.snippet ? stripHtml(hit.snippet).slice(0, 2000) : undefined,
          publishedAt: hit.publishedAt,
          raw: { engine, query: source.query, sourceUrl: hit.url },
        }));
      } catch (error) {
        failures.push(`${engine}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) throw new Error(`AI search failed (${failures.join("; ")})`);
    throw new Error("No configured AI search engine is available");
  }

  private async perplexity(query: string): Promise<SearchHit[] | undefined> {
    const options = this.options.perplexity;
    if (!options.key) return undefined;
    const response = await fetchJson<PerplexityResponse>(options.url, {
      method: "POST",
      headers: { authorization: `Bearer ${options.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: `Find the newest reliable information for: ${query}` }],
        search_mode: "web",
        language_preference: "ko",
        web_search_options: { search_context_size: "medium" },
      }),
    });
    return (response.search_results ?? []).flatMap((item) => item.url && item.title ? [{
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      publishedAt: timestamp(item.date ?? item.last_updated),
    }] : []);
  }

  private async gemini(query: string): Promise<SearchHit[] | undefined> {
    const options = this.options.gemini;
    if (!options.key) return undefined;
    const url = `${options.baseUrl}/${encodeURIComponent(options.model)}:generateContent`;
    const response = await fetchJson<GeminiResponse>(url, {
      method: "POST",
      headers: { "x-goog-api-key": options.key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Find the newest reliable information for: ${query}` }] }],
        tools: [{ google_search: {} }],
      }),
    });
    const candidate = response.candidates?.[0];
    const answer = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join(" ");
    return (candidate?.groundingMetadata?.groundingChunks ?? []).flatMap((chunk) => {
      const web = chunk.web;
      return web?.uri ? [{ title: web.title ?? hostname(web.uri), url: web.uri, snippet: answer }] : [];
    });
  }

  private async xai(query: string): Promise<SearchHit[] | undefined> {
    const options = this.options.xai;
    if (!options.key) return undefined;
    const response = await fetchJson<XaiResponse>(options.url, {
      method: "POST",
      headers: { authorization: `Bearer ${options.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        input: [{ role: "user", content: `Find the newest reliable information for: ${query}` }],
        tools: [{ type: "web_search" }],
      }),
    });
    const content = response.output?.flatMap((output) => output.content ?? []) ?? [];
    const answer = content.map((part) => part.text).filter(Boolean).join(" ");
    const annotations = content.flatMap((part) => part.annotations ?? []);
    const citations = (response.citations ?? []).map((citation) => typeof citation === "string"
      ? { url: citation }
      : citation);
    return [...annotations, ...citations].flatMap((citation) => citation.url ? [{
      title: citation.title ?? hostname(citation.url),
      url: citation.url,
      snippet: answer,
    }] : []);
  }
}
