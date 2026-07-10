import type { Connector, SourcePlan, CollectedItem } from "../types.js";
import { fetchJson } from "../http.js";
import { stableId, stripHtml } from "../util.js";

interface NaverResponse {
  items?: Array<{
    title?: string;
    link?: string;
    originallink?: string;
    description?: string;
    pubDate?: string;
    postdate?: string;
  }>;
}

export class NaverConnector implements Connector {
  constructor(private readonly options: { clientId?: string; clientSecret?: string; baseUrl: string }) {}

  async collect(source: SourcePlan): Promise<CollectedItem[]> {
    if (source.provider !== "naver") return [];
    if (!this.options.clientId || !this.options.clientSecret) throw new Error("NAVER credentials are not configured");

    const url = new URL(`${this.options.baseUrl}/${source.vertical}.json`);
    url.searchParams.set("query", source.query);
    url.searchParams.set("sort", "date");
    url.searchParams.set("display", "100");
    url.searchParams.set("start", "1");
    const data = await fetchJson<NaverResponse>(url, {
      headers: {
        "X-Naver-Client-Id": this.options.clientId,
        "X-Naver-Client-Secret": this.options.clientSecret,
      },
    });
    const collected: CollectedItem[] = [];
    for (const item of data.items ?? []) {
      const link = item.originallink || item.link;
      if (!link || !item.title) continue;
      const date = item.pubDate ?? item.postdate;
      const parsedDate = date && /^\d{8}$/.test(date)
        ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+09:00`).toISOString()
        : date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : undefined;
      collected.push({
        provider: `naver:${source.vertical}`,
        externalId: stableId(link),
        url: link,
        title: stripHtml(item.title),
        summary: item.description ? stripHtml(item.description) : undefined,
        publishedAt: parsedDate,
        raw: item,
      });
    }
    return collected;
  }
}
