import type { Connector, SourcePlan, SourceContext, CollectedItem } from "../types.js";
import { fetchJson } from "../http.js";
import { asArray, stableId } from "../util.js";

interface SaraminJob {
  id?: string | number;
  url?: string;
  active?: number;
  company?: { detail?: { name?: string } };
  position?: { title?: string; location?: { name?: string } };
  "posting-timestamp"?: string | number;
  "modification-timestamp"?: string | number;
  expiration?: string | number;
}

interface SaraminResponse {
  jobs?: { job?: SaraminJob | SaraminJob[] };
}

function timestampToIso(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (Number.isFinite(number)) return new Date(number * (number < 10_000_000_000 ? 1000 : 1)).toISOString();
  return !Number.isNaN(Date.parse(String(value))) ? new Date(String(value)).toISOString() : undefined;
}

export class SaraminConnector implements Connector {
  constructor(private readonly accessKey?: string) {}

  async collect(source: SourcePlan, context: SourceContext): Promise<CollectedItem[]> {
    if (source.provider !== "saramin") return [];
    if (!this.accessKey) throw new Error("SARAMIN_ACCESS_KEY is not configured");

    const overlapFrom = new Date(context.lastSuccessfulAt ?? context.subscriptionCreatedAt);
    overlapFrom.setMinutes(overlapFrom.getMinutes() - 10);
    const collected: CollectedItem[] = [];
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://oapi.saramin.co.kr/job-search");
      url.searchParams.set("access-key", this.accessKey);
      url.searchParams.set("keywords", source.query);
      url.searchParams.set("published_min", String(Math.floor(overlapFrom.getTime() / 1000)));
      url.searchParams.set("published_max", String(Math.floor(context.now.getTime() / 1000)));
      url.searchParams.set("sort", "pa");
      url.searchParams.set("start", String(page));
      url.searchParams.set("count", "110");
      url.searchParams.set("fields", "posting-date expiration-date keyword-code");
      const data = await fetchJson<SaraminResponse>(url);
      const jobs = asArray(data.jobs?.job);
      for (const job of jobs) {
        if (!job.url || !job.position?.title) continue;
        collected.push({
          provider: "saramin",
          externalId: String(job.id ?? stableId(job.url)),
          url: job.url,
          title: job.position.title,
          summary: [job.company?.detail?.name, job.position.location?.name].filter(Boolean).join(" · "),
          publishedAt: timestampToIso(job["posting-timestamp"]),
          raw: job,
        });
      }
      if (jobs.length < 110) break;
    }
    return collected;
  }
}
