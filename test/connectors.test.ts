import assert from "node:assert/strict";
import test from "node:test";
import { GoogleConnector } from "../src/connectors/google.js";
import { NaverConnector } from "../src/connectors/naver.js";
import { SaraminConnector } from "../src/connectors/saramin.js";
import { RssConnector } from "../src/connectors/rss.js";

test("search connectors use one request per monitoring run and validate provider responses", async () => {
  const originalFetch = globalThis.fetch;
  const requested: URL[] = [];
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requested.push(url);
      if (url.hostname === "openapi.naver.com") {
        return Response.json({
          items: [{
            title: "Backend job",
            link: "https://example.com/naver-job",
            description: "New opening",
            postdate: "20260710",
          }],
        });
      }
      if (url.hostname === "customsearch.googleapis.com") {
        return Response.json({
          items: [{ title: "Release", link: "https://example.com/release", snippet: "New release" }],
        });
      }
      if (url.hostname === "oapi.saramin.co.kr") {
        return Response.json({ code: 4, message: "daily request limit exceeded" });
      }
      return new Response("not found", { status: 404 });
    };

    const naver = await new NaverConnector({
      clientId: "client",
      clientSecret: "secret",
      baseUrl: "https://openapi.naver.com/v1/search",
    }).collect({ provider: "naver", vertical: "blog", query: "backend" });
    assert.equal(naver[0]?.publishedAt, "2026-07-09T15:00:00.000Z");
    assert.equal(naver[0]?.title, "Backend job");

    const google = await new GoogleConnector({ apiKey: "key", engineId: "engine" })
      .collect({ provider: "google", query: "release" });
    assert.equal(google[0]?.externalId.length, 64);

    await assert.rejects(
      new SaraminConnector("key").collect({ provider: "saramin", query: "backend" }, {
        subscriptionId: "subscription",
        subscriptionCreatedAt: "2026-07-10T00:00:00.000Z",
        now: new Date("2026-07-10T00:05:00.000Z"),
      }),
      /Saramin API 4/,
    );

    assert.equal(requested.filter((url) => url.hostname === "openapi.naver.com").length, 1);
    assert.equal(requested.filter((url) => url.hostname === "customsearch.googleapis.com").length, 1);
    assert.equal(requested.filter((url) => url.hostname === "oapi.saramin.co.kr").length, 1);
    const naverRequest = requested.find((url) => url.hostname === "openapi.naver.com");
    assert.equal(naverRequest?.searchParams.get("display"), "100");
    assert.equal(naverRequest?.searchParams.get("sort"), "date");
    const googleRequest = requested.find((url) => url.hostname === "customsearch.googleapis.com");
    assert.equal(googleRequest?.searchParams.get("dateRestrict"), "d2");
    assert.equal(googleRequest?.searchParams.get("start"), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Saramin connector applies overlap timestamps and normalizes jobs", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl: URL | undefined;
  try {
    globalThis.fetch = async (input) => {
      requestUrl = new URL(input instanceof Request ? input.url : input.toString());
      return Response.json({
        jobs: {
          job: {
            id: 42,
            url: "https://saramin.example/jobs/42",
            company: { detail: { name: "Example Corp" } },
            position: { title: "Backend Engineer", location: { name: "Seoul" } },
            "posting-timestamp": Date.parse("2026-07-10T00:00:00.000Z") / 1000,
          },
        },
      });
    };
    const results = await new SaraminConnector("access-key").collect(
      { provider: "saramin", query: "backend" },
      {
        subscriptionId: "subscription",
        subscriptionCreatedAt: "2026-07-10T00:00:00.000Z",
        lastSuccessfulAt: "2026-07-10T00:30:00.000Z",
        now: new Date("2026-07-10T01:00:00.000Z"),
      },
    );
    assert.equal(requestUrl?.searchParams.get("published_min"), String(Date.parse("2026-07-10T00:20:00.000Z") / 1000));
    assert.equal(requestUrl?.searchParams.get("published_max"), String(Date.parse("2026-07-10T01:00:00.000Z") / 1000));
    assert.equal(results[0]?.externalId, "42");
    assert.equal(results[0]?.summary, "Example Corp · Seoul");
    assert.equal(results[0]?.publishedAt, "2026-07-10T00:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RSS connector parses RSS and Atom feeds and filters unrelated entries", async () => {
  const rss = `
    <rss><channel>
      <item>
        <guid>release-1</guid>
        <title><![CDATA[<b>TypeScript</b> Release]]></title>
        <link>https://example.com/releases/1</link>
        <description>Compiler update</description>
        <pubDate>Fri, 10 Jul 2026 09:00:00 GMT</pubDate>
      </item>
      <item>
        <guid>unrelated</guid>
        <title>Cooking notes</title>
        <link>https://example.com/cooking</link>
      </item>
    </channel></rss>`;
  const rssResults = await new RssConnector(async () => rss).collect({
    provider: "rss",
    url: "https://feeds.example.com/releases.xml",
    query: "typescript",
  });
  assert.equal(rssResults.length, 1);
  assert.equal(rssResults[0]?.title, "TypeScript Release");
  assert.equal(rssResults[0]?.externalId, "release-1");

  const atom = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>tag:example.com,2026:2</id>
        <title>Security bulletin</title>
        <link rel="alternate" href="https://example.com/security/2" />
        <summary>Critical patch</summary>
        <updated>2026-07-10T10:00:00Z</updated>
      </entry>
    </feed>`;
  const atomResults = await new RssConnector(async () => atom).collect({
    provider: "rss",
    url: "https://feeds.example.com/security.xml",
    query: "critical",
  });
  assert.equal(atomResults[0]?.url, "https://example.com/security/2");
  assert.equal(atomResults[0]?.publishedAt, "2026-07-10T10:00:00.000Z");
});

test("connectors fail fast when credentials are missing", async () => {
  await assert.rejects(
    new NaverConnector({ baseUrl: "https://openapi.naver.com/v1/search" })
      .collect({ provider: "naver", vertical: "news", query: "test" }),
    /NAVER credentials/,
  );
  await assert.rejects(
    new GoogleConnector({}).collect({ provider: "google", query: "test" }),
    /Google Search credentials/,
  );
  await assert.rejects(
    new SaraminConnector().collect({ provider: "saramin", query: "test" }, {
      subscriptionId: "subscription",
      subscriptionCreatedAt: "2026-07-10T00:00:00.000Z",
      now: new Date("2026-07-10T01:00:00.000Z"),
    }),
    /SARAMIN_ACCESS_KEY/,
  );
});
