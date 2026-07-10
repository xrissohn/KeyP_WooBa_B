import assert from "node:assert/strict";
import test from "node:test";
import { AiItemReviewer } from "../src/review.js";
import type { CollectedItem, StoredSubscription } from "../src/types.js";

const subscription: StoredSubscription = {
  id: "subscription-1",
  installationId: "fid-1",
  keyword: "서울 Java 백엔드 채용 공고",
  plan: {
    topic: "employment",
    normalizedKeywords: ["서울", "Java", "백엔드", "채용"],
    intervalSeconds: 60,
    sources: [{ provider: "naver", vertical: "news", query: "서울 Java 백엔드 채용" }],
  },
  active: true,
  createdAt: "2026-07-10T00:00:00.000Z",
  nextRunAt: "2026-07-10T00:01:00.000Z",
};

const items: CollectedItem[] = [
  { provider: "naver:news", externalId: "1", url: "https://company.example/jobs/1", title: "서울 Java 백엔드 채용" },
  { provider: "x", externalId: "2", url: "https://x.com/user/status/2", title: "부산 프론트엔드 구인 루머" },
];

test("AI reviewer applies server-side relevance and credibility thresholds", async () => {
  const originalFetch = globalThis.fetch;
  let sentIntent = "";
  try {
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      sentIntent = request.messages.find((message) => message.role === "user")?.content ?? "";
      return Response.json({ choices: [{ message: { content: JSON.stringify({ decisions: [
        { itemIndex: 0, relevant: true, relevanceScore: 96, credibilityScore: 88, reason: "official job page", signals: ["primary-source"] },
        { itemIndex: 1, relevant: true, relevanceScore: 90, credibilityScore: 30, reason: "unattributed rumor", signals: ["anonymous-social"] },
      ] }) } }] });
    };
    const reviewer = new AiItemReviewer({
      api: { url: "https://openai.example/chat/completions", key: "key", model: "review-model" },
      review: { enabled: true, required: true, relevanceThreshold: 70, credibilityThreshold: 55, batchSize: 15 },
    });
    const results = await reviewer.review(subscription, items);

    assert.equal(results[0]?.accepted, true);
    assert.equal(results[1]?.accepted, false);
    assert.equal(results[1]?.credibilityScore, 30);
    assert.match(sentIntent, /서울 Java 백엔드 채용 공고/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("required AI review fails closed when no key is configured", async () => {
  const reviewer = new AiItemReviewer({
    api: { url: "https://openai.example/chat/completions", key: undefined, model: "review-model" },
    review: { enabled: false, required: true, relevanceThreshold: 70, credibilityThreshold: 55, batchSize: 15 },
  });
  await assert.rejects(reviewer.review(subscription, items), /AI review is required/);
});
