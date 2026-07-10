import type { CollectedItem, Connector, SourceContext, SourcePlan } from "../types.js";
import { fetchJson } from "../http.js";

interface XPost {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
}

interface XUser {
  id?: string;
  username?: string;
}

interface XSearchResponse {
  data?: XPost[];
  includes?: { users?: XUser[] };
  errors?: Array<{ title?: string; detail?: string; status?: number }>;
  meta?: { newest_id?: string; oldest_id?: string; result_count?: number; next_token?: string };
}

function cleanXText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^RT\s+@\w+:\s*/i, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/(^|\s)@\w+/g, " ")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xTitle(text: string): string {
  const cleaned = cleanXText(text);
  if (!cleaned) return "X 게시물";
  const firstSentence = cleaned.match(/^.{12,120}?[.!?。！？](?=\s|$)/u)?.[0];
  return (firstSentence ?? cleaned).slice(0, 120).trim();
}

function xTimestamp(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export class XConnector implements Connector {
  constructor(private readonly options: { bearerToken?: string; baseUrl: string }) {}

  async collect(source: SourcePlan, context: SourceContext): Promise<CollectedItem[]> {
    if (source.provider !== "x") return [];
    if (!this.options.bearerToken) throw new Error("X_BEARER_TOKEN is not configured");

    const url = new URL(this.options.baseUrl);
    url.searchParams.set("query", source.query);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("tweet.fields", "created_at,text,author_id");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");
    url.searchParams.set("sort_order", "recency");
    if (context.lastSuccessfulAt) {
      const overlapStart = new Date(Date.parse(context.lastSuccessfulAt) - 2 * 60_000);
      url.searchParams.set("start_time", xTimestamp(overlapStart));
    }

    const response = await fetchJson<XSearchResponse>(url, {
      headers: { authorization: `Bearer ${this.options.bearerToken}` },
    });
    if (!response.data && response.errors?.length) {
      const error = response.errors[0];
      throw new Error(`X API ${error?.status ?? "error"}: ${error?.detail ?? error?.title ?? "unknown error"}`);
    }

    const usernames = new Map(
      (response.includes?.users ?? [])
        .filter((user): user is Required<Pick<XUser, "id" | "username">> => Boolean(user.id && user.username))
        .map((user) => [user.id, user.username]),
    );

    return (response.data ?? []).flatMap((post): CollectedItem[] => {
      if (!post.id || !post.text) return [];
      const username = post.author_id ? usernames.get(post.author_id) : undefined;
      const postUrl = username
        ? `https://x.com/${encodeURIComponent(username)}/status/${post.id}`
        : `https://x.com/i/web/status/${post.id}`;
      const normalizedText = post.text.replace(/\s+/g, " ").trim();
      const summary = cleanXText(post.text);
      const publishedAt = post.created_at && !Number.isNaN(Date.parse(post.created_at))
        ? new Date(post.created_at).toISOString()
        : undefined;
      return [{
        provider: "x",
        externalId: post.id,
        url: postUrl,
        title: xTitle(post.text),
        summary: summary || normalizedText,
        publishedAt,
        raw: post,
      }];
    });
  }
}
