import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateDeterministicAgent,
  evaluateRetrieval,
  filePrecision,
  fileRecall,
  precisionAtK,
  summarizeAgentEval,
  summarizeEval,
  testsPassedFromChecks,
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

test("filePrecision and fileRecall score modified file overlap", () => {
  const correct = ["src/a.ts", "src/b.ts", "src/c.ts"];
  const modified = ["src/a.ts", "src/b.ts", "src/x.ts"];

  assert.equal(filePrecision(modified, correct), 2 / 3);
  assert.equal(fileRecall(modified, correct), 2 / 3);
});

test("filePrecision returns 0 when no files were modified", () => {
  assert.equal(filePrecision([], ["src/a.ts"]), 0);
  assert.equal(fileRecall([], ["src/a.ts"]), 0);
});

test("evaluateDeterministicAgent separates file and test metrics", () => {
  const metrics = evaluateDeterministicAgent({
    correctFiles: ["src/a.ts", "src/b.ts"],
    modifiedFiles: ["src/a.ts"],
    checks: [
      { name: "typecheck", passed: true },
      { name: "tests", passed: false },
    ],
    verificationPassed: false,
  });

  assert.equal(metrics.filePrecision, 1);
  assert.equal(metrics.fileRecall, 0.5);
  assert.equal(metrics.testsPassed, false);
  assert.equal(metrics.verificationPassed, false);
});

test("testsPassedFromChecks reads only the tests check", () => {
  assert.equal(
    testsPassedFromChecks([
      { name: "typecheck", passed: false },
      { name: "tests", passed: true },
    ]),
    true,
  );
  assert.equal(testsPassedFromChecks([]), false);
});

test("summarizeAgentEval averages deterministic and judge metrics", () => {
  const summary = summarizeAgentEval([
    {
      issueId: "eval-01",
      title: "one",
      split: "train",
      correctFiles: ["src/a.ts"],
      modifiedFiles: ["src/a.ts"],
      filePrecision: 1,
      fileRecall: 1,
      testsPassed: true,
      verificationPassed: true,
      prAccepted: true,
      judgeScore: 0.9,
      judgeRationale: "good",
      agentCompleted: true,
      passed: true,
    },
    {
      issueId: "eval-02",
      title: "two",
      split: "test",
      correctFiles: ["src/b.ts"],
      modifiedFiles: ["src/x.ts"],
      filePrecision: 0,
      fileRecall: 0,
      testsPassed: false,
      verificationPassed: false,
      prAccepted: false,
      judgeScore: 0.2,
      judgeRationale: "bad",
      agentCompleted: true,
      passed: false,
    },
  ]);

  assert.equal(summary.issueCount, 2);
  assert.equal(summary.meanFilePrecision, 0.5);
  assert.equal(summary.testPassRate, 0.5);
  assert.equal(summary.prAcceptanceRate, 0.5);
  assert.equal(summary.failures.length, 1);
});
