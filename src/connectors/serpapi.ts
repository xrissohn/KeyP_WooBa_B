import type { CollectedItem, Connector, SourcePlan } from "../types.js";
import { fetchJson } from "../http.js";
import { stableId, stripHtml } from "../util.js";

interface SerpApiResponse {
  error?: string;
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
    source?: string;
  }>;
}

export class SerpApiConnector implements Connector {
  constructor(private readonly options: { key?: string; url: string }) {}

  async collect(source: SourcePlan): Promise<CollectedItem[]> {
    if (source.provider !== "serpapi") return [];
    if (!this.options.key) throw new Error("SERPAPI_API_KEY is not configured");
    const url = new URL(this.options.url);
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", source.query);
    url.searchParams.set("hl", "ko");
    url.searchParams.set("gl", "kr");
    url.searchParams.set("num", "20");
    url.searchParams.set("api_key", this.options.key);
    const response = await fetchJson<SerpApiResponse>(url);
    if (response.error) throw new Error(`SerpAPI: ${response.error}`);
    return (response.organic_results ?? []).flatMap((item) => item.link && item.title ? [{
      provider: "serpapi:google",
      externalId: stableId(item.link),
      url: item.link,
      title: stripHtml(item.title),
      summary: item.snippet ? stripHtml(item.snippet) : undefined,
      publishedAt: item.date && !Number.isNaN(Date.parse(item.date)) ? new Date(item.date).toISOString() : undefined,
      raw: item,
    }] : []);
  }
}
