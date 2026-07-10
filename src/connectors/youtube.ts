import type { CollectedItem, Connector, SourcePlan } from "../types.js";
import { fetchJson } from "../http.js";
import { stripHtml } from "../util.js";

interface YoutubeResponse {
  error?: { message?: string };
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string };
  }>;
}

export class YoutubeConnector implements Connector {
  constructor(private readonly options: { key?: string; url: string }) {}

  async collect(source: SourcePlan): Promise<CollectedItem[]> {
    if (source.provider !== "youtube") return [];
    if (!this.options.key) throw new Error("YOUTUBE_API_KEY is not configured");
    const url = new URL(this.options.url);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "date");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("q", source.query);
    url.searchParams.set("key", this.options.key);
    const response = await fetchJson<YoutubeResponse>(url);
    if (response.error) throw new Error(`YouTube API: ${response.error.message ?? "unknown error"}`);
    return (response.items ?? []).flatMap((item) => {
      const id = item.id?.videoId;
      const snippet = item.snippet;
      if (!id || !snippet?.title) return [];
      return [{
        provider: "youtube",
        externalId: id,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        title: stripHtml(snippet.title),
        summary: snippet.description ? stripHtml(snippet.description) : undefined,
        publishedAt: snippet.publishedAt && !Number.isNaN(Date.parse(snippet.publishedAt))
          ? new Date(snippet.publishedAt).toISOString()
          : undefined,
        raw: item,
      }];
    });
  }
}
