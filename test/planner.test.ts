import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { SearchPlanner } from "../src/planner.js";

interface ConfigSnapshot {
  aiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  xBearerToken?: string;
  rss: string[];
}

function snapshotConfig(): ConfigSnapshot {
  return {
    aiKey: config.ai.key,
    naverClientId: config.naver.clientId,
    naverClientSecret: config.naver.clientSecret,
    xBearerToken: config.x.bearerToken,
    rss: [...config.defaultRssFeeds],
  };
}

function restoreConfig(snapshot: ConfigSnapshot): void {
  config.ai.key = snapshot.aiKey;
  config.naver.clientId = snapshot.naverClientId;
  config.naver.clientSecret = snapshot.naverClientSecret;
  config.x.bearerToken = snapshot.xBearerToken;
  config.defaultRssFeeds.splice(0, config.defaultRssFeeds.length, ...snapshot.rss);
}

function disableProviders(): void {
  config.naver.clientId = undefined;
  config.naver.clientSecret = undefined;
  config.x.bearerToken = undefined;
  config.defaultRssFeeds.splice(0);
}

test("planner creates a webhook-only employment fallback when no APIs are configured", async () => {
  const snapshot = snapshotConfig();
  try {
    config.ai.key = undefined;
    disableProviders();
    const result = await new SearchPlanner().create("  서울   백엔드 개발자 채용  ");
    assert.equal(result.mode, "fallback");
    assert.equal(result.plan.topic, "employment");
    assert.deepEqual(result.plan.normalizedKeywords, ["서울", "백엔드", "개발자", "채용"]);
    assert.deepEqual(result.plan.sources, [{ provider: "webhook", name: "default" }]);
  } finally {
    restoreConfig(snapshot);
  }
});

test("AI plans retain only configured providers", async () => {
  const snapshot = snapshotConfig();
  const originalFetch = globalThis.fetch;
  try {
    disableProviders();
    config.ai.key = "ai-key";
    config.naver.clientId = "naver-client";
    config.naver.clientSecret = "naver-secret";
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              topic: "technology",
              normalizedKeywords: ["TypeScript"],
              intervalSeconds: 3600,
              sources: [
                { provider: "naver", vertical: "news", query: "TypeScript" },
                { provider: "x", query: "TypeScript" },
              ],
            }),
          },
        }],
      });
    };

    const result = await new SearchPlanner().create("TypeScript release");
    assert.equal(result.mode, "ai");
    assert.equal(result.plan.intervalSeconds, config.pollIntervalSeconds);
    assert.deepEqual(result.plan.sources, [
      { provider: "naver", vertical: "news", query: "TypeScript" },
    ]);
    assert.equal(requestBody?.model, config.ai.model);
    const responseFormat = requestBody?.response_format as {
      type?: string;
      json_schema?: { schema?: { properties?: { sources?: { items?: Record<string, unknown> } } } };
    };
    assert.equal(responseFormat.type, "json_schema");
    const sourceVariants = responseFormat.json_schema?.schema?.properties?.sources?.items;
    assert.ok(Array.isArray(sourceVariants?.anyOf));
    assert.equal(sourceVariants?.oneOf, undefined);
    for (const variant of sourceVariants.anyOf as Array<{ properties?: { provider?: { type?: string } } }>) {
      assert.equal(variant.properties?.provider?.type, "string");
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreConfig(snapshot);
  }
});

test("planner rejects AI-selected RSS URLs outside the configured allowlist", async () => {
  const snapshot = snapshotConfig();
  const originalFetch = globalThis.fetch;
  try {
    disableProviders();
    config.ai.key = "ai-key";
    config.defaultRssFeeds.push("https://feeds.example.com/allowed.xml");
    globalThis.fetch = async () => Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            topic: "security",
            normalizedKeywords: ["security"],
            intervalSeconds: 300,
            sources: [{ provider: "rss", url: "https://attacker.example/feed", query: "security" }],
          }),
        },
      }],
    });

    const result = await new SearchPlanner().create("security news");
    assert.equal(result.mode, "fallback");
    assert.match(result.fallbackReason ?? "", /outside DEFAULT_RSS_FEEDS/);
    assert.deepEqual(result.plan.sources, [{
      provider: "rss",
      url: "https://feeds.example.com/allowed.xml",
      query: "security news",
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreConfig(snapshot);
  }
});
