import { createHash } from "node:crypto";
import type { SourcePlan } from "./types.js";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "ref",
  "source",
  "igshid",
]);

export function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourceFingerprint(source: SourcePlan): string {
  const query = "query" in source ? source.query?.trim().replace(/\s+/g, " ").toLocaleLowerCase() : undefined;
  switch (source.provider) {
    case "naver": return stableId(source.provider, source.vertical, query ?? "");
    case "google":
    case "saramin": return stableId(source.provider, query ?? "");
    case "rss": return stableId(source.provider, new URL(source.url).toString(), query ?? "");
    case "webhook": return stableId(source.provider, source.name);
  }
}

export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
