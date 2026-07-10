import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson, safeFetchText } from "../src/http.js";

test("safeFetchText rejects loopback and credential-bearing feed URLs before fetching", async () => {
  await assert.rejects(safeFetchText("http://127.0.0.1/feed.xml"), /private or unsupported/);
  await assert.rejects(safeFetchText("https://user:pass@example.com/feed.xml"), /credentials are not allowed/);
});

test("fetchJson reports upstream HTTP status without exposing an unbounded response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("x".repeat(1_000), { status: 429 });
    await assert.rejects(
      fetchJson("https://api.example.com/search"),
      (error: Error) => error.message.includes("HTTP 429 from api.example.com") && error.message.length < 400,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
