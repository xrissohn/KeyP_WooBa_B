import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeUrl, stableId } from "../src/util.js";

test("canonicalizeUrl removes tracking parameters but preserves identity parameters", () => {
  assert.equal(
    canonicalizeUrl("https://example.com/jobs/123/?utm_source=naver&id=7&ref=home#details"),
    "https://example.com/jobs/123?id=7",
  );
});

test("stableId is deterministic", () => {
  assert.equal(stableId("provider", "42"), stableId("provider", "42"));
  assert.notEqual(stableId("provider", "42"), stableId("provider", "43"));
});
