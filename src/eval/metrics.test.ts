import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRetrieval,
  precisionAtK,
  summarizeEval,
} from "./metrics.js";
import { retrievedFilesFromChunks } from "./runner.js";

test("precisionAtK counts relevant files in top-k chunk results", () => {
  const relevant = ["src/a.ts", "src/b.ts"];
  const retrieved = [
    "src/a.ts",
    "src/x.ts",
    "src/b.ts",
    "src/y.ts",
    "src/z.ts",
  ];

  assert.equal(precisionAtK(retrieved, relevant, 1), 1);
  assert.equal(precisionAtK(retrieved, relevant, 5), 0.4);
  assert.equal(precisionAtK(retrieved, relevant, 10), 0.2);
});

test("evaluateRetrieval marks failures when no relevant file is retrieved", () => {
  const result = evaluateRetrieval({
    issueId: "issue-99",
    title: "demo",
    query: "demo query",
    relevantFiles: ["src/rag/store.ts"],
    retrievedFiles: ["src/tools.ts", "src/agent.ts"],
  });

  assert.equal(result.passedAt1, false);
  assert.equal(result.passedAt10, false);
  assert.equal(result.precisionAt1, 0);
});

test("summarizeEval averages precision across issues", () => {
  const summary = summarizeEval([
    evaluateRetrieval({
      issueId: "a",
      title: "a",
      query: "q",
      relevantFiles: ["src/a.ts"],
      retrievedFiles: ["src/a.ts"],
    }),
    evaluateRetrieval({
      issueId: "b",
      title: "b",
      query: "q",
      relevantFiles: ["src/b.ts"],
      retrievedFiles: ["src/x.ts"],
    }),
  ]);

  assert.equal(summary.issueCount, 2);
  assert.equal(summary.meanPrecisionAt1, 0.5);
  assert.equal(summary.failures.length, 1);
});

test("retrievedFilesFromChunks preserves chunk rank order", () => {
  const files = retrievedFilesFromChunks([
    { filePath: "src/a.ts" },
    { filePath: "src/b.ts" },
    { filePath: "src/a.ts" },
  ]);

  assert.deepEqual(files, ["src/a.ts", "src/b.ts", "src/a.ts"]);
});
