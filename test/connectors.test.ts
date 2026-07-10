import assert from "node:assert/strict";
import test from "node:test";
import { GoogleConnector } from "../src/connectors/google.js";
import { NaverConnector } from "../src/connectors/naver.js";
import { SaraminConnector } from "../src/connectors/saramin.js";

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

    await new GoogleConnector({ apiKey: "key", engineId: "engine" })
      .collect({ provider: "google", query: "release" });

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
  } finally {
    globalThis.fetch = originalFetch;
  }
});
