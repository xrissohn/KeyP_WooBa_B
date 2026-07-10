import { XMLParser } from "fast-xml-parser";
import type { Connector, SourcePlan, CollectedItem } from "../types.js";
import { safeFetchText } from "../http.js";
import { asArray, stableId, stripHtml } from "../util.js";

type FeedNode = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record["#text"] ?? record.href ?? record._);
  }
  return undefined;
}

function atomLink(value: unknown): string | undefined {
  for (const link of asArray(value)) {
    if (typeof link === "string") return link;
    if (link && typeof link === "object") {
      const record = link as Record<string, unknown>;
      if (!record.rel || record.rel === "alternate") return text(record.href);
    }
  }
  return undefined;
}

export class RssConnector implements Connector {
  private readonly parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", trimValues: true });

  constructor(private readonly fetchText: (url: string) => Promise<string> = safeFetchText) {}

  async collect(source: SourcePlan): Promise<CollectedItem[]> {
    if (source.provider !== "rss") return [];
    const xml = await this.fetchText(source.url);
    const parsed = this.parser.parse(xml) as FeedNode;
    const rssItems = asArray(((parsed.rss as FeedNode | undefined)?.channel as FeedNode | undefined)?.item) as FeedNode[];
    const atomEntries = asArray((parsed.feed as FeedNode | undefined)?.entry) as FeedNode[];
    const nodes = [...rssItems, ...atomEntries];
    const keywords = source.query?.toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];

    return nodes.flatMap((node): CollectedItem[] => {
      const title = text(node.title);
      const link = text(node.link) ?? atomLink(node.link);
      const summary = text(node.description ?? node.summary ?? node.content);
      if (!title || !link) return [];
      const haystack = `${title} ${summary ?? ""}`.toLocaleLowerCase();
      if (keywords.length > 0 && !keywords.some((keyword) => haystack.includes(keyword))) return [];
      const guid = text(node.guid ?? node.id) ?? stableId(link);
      const date = text(node.pubDate ?? node.published ?? node.updated ?? node["dc:date"]);
      return [{
        provider: `rss:${stableId(source.url).slice(0, 24)}`,
        externalId: guid,
        url: link,
        title: stripHtml(title),
        summary: summary ? stripHtml(summary).slice(0, 2000) : undefined,
        publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : undefined,
        raw: node,
      }];
    });
  }
}
