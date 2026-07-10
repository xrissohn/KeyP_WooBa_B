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

    const collected: CollectedItem[] = [];
    for (let page = 0; page < 3; page++) {
      const url = new URL(`${this.options.baseUrl}/${source.vertical}.json`);
      url.searchParams.set("query", source.query);
      url.searchParams.set("sort", "date");
      url.searchParams.set("display", "100");
      url.searchParams.set("start", String(page * 100 + 1));
      const data = await fetchJson<NaverResponse>(url, {
        headers: {
          "X-Naver-Client-Id": this.options.clientId,
          "X-Naver-Client-Secret": this.options.clientSecret,
        },
      });
      const items = data.items ?? [];
      for (const item of items) {
        const link = item.originallink || item.link;
        if (!link || !item.title) continue;
        const date = item.pubDate ?? item.postdate;
        const parsedDate = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : undefined;
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
      if (items.length < 100) break;
    }
    return collected;
  }
}
