import type { Connector, SourcePlan, CollectedItem } from "../types.js";
import { fetchJson } from "../http.js";
import { stableId } from "../util.js";

interface GoogleResponse {
  items?: Array<{
    cacheId?: string;
    link?: string;
    title?: string;
    snippet?: string;
    pagemap?: { metatags?: Array<Record<string, string>> };
  }>;
}

export class GoogleConnector implements Connector {
  constructor(private readonly options: { apiKey?: string; engineId?: string }) {}

  async collect(source: SourcePlan): Promise<CollectedItem[]> {
    if (source.provider !== "google") return [];
    if (!this.options.apiKey || !this.options.engineId) throw new Error("Google Search credentials are not configured");
    const url = new URL("https://customsearch.googleapis.com/customsearch/v1");
    url.searchParams.set("key", this.options.apiKey);
    url.searchParams.set("cx", this.options.engineId);
    url.searchParams.set("q", source.query);
    url.searchParams.set("num", "10");
    url.searchParams.set("start", "1");
    url.searchParams.set("dateRestrict", "d2");
    url.searchParams.set("sort", "date");
    const data = await fetchJson<GoogleResponse>(url);
    const collected: CollectedItem[] = [];
    for (const item of data.items ?? []) {
      if (!item.link || !item.title) continue;
      const meta = item.pagemap?.metatags?.[0];
      const date = meta?.["article:published_time"] ?? meta?.date ?? meta?.["datepublished"];
      const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : undefined;
      collected.push({
        provider: "google",
        externalId: item.cacheId || stableId(item.link),
        url: item.link,
        title: item.title,
        summary: item.snippet,
        publishedAt,
        raw: item,
      });
    }
    return collected;
  }
}
