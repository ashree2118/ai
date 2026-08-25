import assert from "node:assert/strict";
import test from "node:test";
import type { CodeChunk } from "../chunker/types.js";
import { EMBEDDING_DIMENSION } from "../embeddings/client.js";
import { chunkEmbeddingText, toPgVector } from "./store.js";

const SAMPLE_CHUNK: CodeChunk = {
  id: "sample.ts#function:add@1",
  filePath: "sample.ts",
  symbol: "add",
  kind: "function",
  startLine: 1,
  endLine: 3,
  code: "export function add(a: number, b: number) {\n  return a + b;\n}",
};

test("chunkEmbeddingText includes metadata and code", () => {
  const text = chunkEmbeddingText(SAMPLE_CHUNK);
  assert.match(text, /file: sample\.ts/);
  assert.match(text, /symbol: add/);
  assert.match(text, /lines: 1-3/);
  assert.match(text, /export function add/);
});

test("toPgVector formats pgvector literal with expected dimensions", () => {
  const vector = Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => index);
  const literal = toPgVector(vector);
  assert.match(literal, /^\[/);
  assert.match(literal, /\]$/);
  assert.equal(literal.split(",").length, EMBEDDING_DIMENSION);
});

test("toPgVector rejects wrong dimension count", () => {
  assert.throws(() => toPgVector([1, 2, 3]), /expected 1536 dimensions/);
});
