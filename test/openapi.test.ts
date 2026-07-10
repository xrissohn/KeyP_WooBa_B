import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

type JsonObject = Record<string, unknown>;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

function asObject(value: unknown): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonObject;
}

function resolveRef(document: JsonObject, ref: string): unknown {
  assert.match(ref, /^#\//, `Only local OpenAPI refs are supported: ${ref}`);
  return ref.slice(2).split("/").reduce<unknown>((current, segment) => {
    const decoded = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    return asObject(current)[decoded];
  }, document);
}

function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") refs.push(child);
      else collectRefs(child, refs);
    }
  }
  return refs;
}

test("OpenAPI document parses and matches every implemented route", () => {
  const source = readFileSync("src/app.ts", "utf8");
  const implemented = [...source.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)]
    .map((match) => `${match[1]?.toUpperCase()} ${match[2]?.replace(/:([A-Za-z]\w*)/g, "{$1}")}`)
    .sort();

  const document = asObject(parse(readFileSync("docs/openapi.yaml", "utf8"), { uniqueKeys: true }));
  assert.equal(document.openapi, "3.1.0");
  const documented: string[] = [];
  for (const [path, pathItemValue] of Object.entries(asObject(document.paths))) {
    for (const method of Object.keys(asObject(pathItemValue))) {
      if (HTTP_METHODS.has(method)) documented.push(`${method.toUpperCase()} ${path}`);
    }
  }

  assert.deepEqual(documented.sort(), implemented);
});

test("OpenAPI operation IDs are unique and all local refs resolve", () => {
  const document = asObject(parse(readFileSync("docs/openapi.yaml", "utf8"), { uniqueKeys: true }));
  const operationIds: string[] = [];
  for (const pathItemValue of Object.values(asObject(document.paths))) {
    for (const [method, operationValue] of Object.entries(asObject(pathItemValue))) {
      if (!HTTP_METHODS.has(method)) continue;
      const operation = asObject(operationValue);
      assert.equal(typeof operation.operationId, "string", `${method} operation is missing operationId`);
      operationIds.push(String(operation.operationId));
    }
  }
  assert.equal(new Set(operationIds).size, operationIds.length, "operationId values must be unique");

  for (const ref of collectRefs(document)) {
    assert.notEqual(resolveRef(document, ref), undefined, `Unresolved OpenAPI ref: ${ref}`);
  }
});

test("all non-health operations declare an authentication scheme", () => {
  const document = asObject(parse(readFileSync("docs/openapi.yaml", "utf8"), { uniqueKeys: true }));
  for (const [path, pathItemValue] of Object.entries(asObject(document.paths))) {
    for (const [method, operationValue] of Object.entries(asObject(pathItemValue))) {
      if (!HTTP_METHODS.has(method) || path === "/health") continue;
      const operation = asObject(operationValue);
      assert.ok(Array.isArray(operation.security) && operation.security.length > 0, `${method.toUpperCase()} ${path} has no security`);
    }
  }
});
