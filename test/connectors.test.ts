import assert from "node:assert/strict";
import test from "node:test";
import { NaverConnector } from "../src/connectors/naver.js";
import { RssConnector } from "../src/connectors/rss.js";
import { XConnector } from "../src/connectors/x.js";

test("NAVER connector normalizes results and uses one request per run", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl: URL | undefined;
  try {
    globalThis.fetch = async (input) => {
      requestUrl = new URL(input instanceof Request ? input.url : input.toString());
      return Response.json({
        items: [{
          title: "<b>Backend</b> job",
          originallink: "https://example.com/naver-job",
          link: "https://search.naver.com/result",
          description: "New <b>opening</b>",
          postdate: "20260710",
        }],
      });
    };

    const results = await new NaverConnector({
      clientId: "client",
      clientSecret: "secret",
      baseUrl: "https://openapi.naver.com/v1/search",
    }).collect({ provider: "naver", vertical: "blog", query: "backend" });

    assert.equal(results[0]?.publishedAt, "2026-07-09T15:00:00.000Z");
    assert.equal(results[0]?.title, "Backend job");
    assert.equal(results[0]?.summary, "New opening");
    assert.equal(results[0]?.url, "https://example.com/naver-job");
    assert.equal(requestUrl?.searchParams.get("display"), "100");
    assert.equal(requestUrl?.searchParams.get("sort"), "date");
    assert.equal(requestUrl?.searchParams.get("start"), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("X connector applies overlap, expands usernames, and builds canonical post URLs", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl: URL | undefined;
  let authorization: string | null = null;
  try {
    globalThis.fetch = async (input, init) => {
      requestUrl = new URL(input instanceof Request ? input.url : input.toString());
      authorization = new Headers(init?.headers).get("authorization");
      return Response.json({
        data: [
          {
            id: "1234567890123456789",
            text: "홍명보\n축구대표팀 최신 소식",
            author_id: "author-1",
            created_at: "2026-07-10T00:45:00.000Z",
          },
          {
            id: "9876543210987654321",
            text: "Username expansion 없는 게시물",
            author_id: "missing-author",
          },
        ],
        includes: { users: [{ id: "author-1", username: "DouglasKim83979" }] },
        meta: { newest_id: "1234567890123456789", result_count: 2 },
      });
    };

    const results = await new XConnector({
      bearerToken: "encoded-token",
      baseUrl: "https://api.x.com/2/tweets/search/recent",
    }).collect(
      { provider: "x", query: "홍명보" },
      {
        subscriptionId: "subscription",
        subscriptionCreatedAt: "2026-07-10T00:00:00.000Z",
        lastSuccessfulAt: "2026-07-10T00:30:00.000Z",
        now: new Date("2026-07-10T01:00:00.000Z"),
      },
    );

    assert.equal(authorization, "Bearer encoded-token");
    assert.equal(requestUrl?.searchParams.get("query"), "홍명보");
    assert.equal(requestUrl?.searchParams.get("max_results"), "100");
    assert.equal(requestUrl?.searchParams.get("tweet.fields"), "created_at,text,author_id");
    assert.equal(requestUrl?.searchParams.get("expansions"), "author_id");
    assert.equal(requestUrl?.searchParams.get("user.fields"), "username");
    assert.equal(requestUrl?.searchParams.get("start_time"), "2026-07-10T00:28:00Z");
    assert.equal(results[0]?.url, "https://x.com/DouglasKim83979/status/1234567890123456789");
    assert.equal(results[0]?.title, "홍명보 축구대표팀 최신 소식");
    assert.equal(results[0]?.publishedAt, "2026-07-10T00:45:00.000Z");
    assert.equal(results[1]?.url, "https://x.com/i/web/status/9876543210987654321");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("X connector surfaces API problem responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({
      errors: [{ status: 429, title: "Too Many Requests", detail: "Rate limit exceeded" }],
    });
    await assert.rejects(
      new XConnector({ bearerToken: "token", baseUrl: "https://api.x.com/2/tweets/search/recent" }).collect(
        { provider: "x", query: "test" },
        {
          subscriptionId: "subscription",
          subscriptionCreatedAt: "2026-07-10T00:00:00.000Z",
          now: new Date("2026-07-10T01:00:00.000Z"),
        },
      ),
      /X API 429: Rate limit exceeded/,
    );
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
    new XConnector({ baseUrl: "https://api.x.com/2/tweets/search/recent" }).collect(
      { provider: "x", query: "test" },
      {
        subscriptionId: "subscription",
        subscriptionCreatedAt: "2026-07-10T00:00:00.000Z",
        now: new Date("2026-07-10T01:00:00.000Z"),
      },
    ),
    /X_BEARER_TOKEN/,
  );
});
