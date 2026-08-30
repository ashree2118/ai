import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runBenchmark } from "./benchmark.js";
import { saveBenchmarkRun } from "./regression.js";
import { summarizeAgentEval, summarizeEval } from "./metrics.js";

test("runBenchmark stores results and compares against previous run", async () => {
  const resultsDir = await mkdtemp(join(tmpdir(), "benchmark-"));
  try {
    await saveBenchmarkRun(resultsDir, {
      id: "baseline",
      timestamp: "2026-08-30T00:00:00.000Z",
      gitSha: "base",
      split: "test",
      metrics: {
        retrievalMeanP1: 0.5,
        retrievalMeanP5: 0.5,
        retrievalMeanP10: 0.5,
        agentFilePrecision: 0.5,
        agentFileRecall: 0.5,
        agentTestPassRate: 0.5,
        agentPrAcceptanceRate: 0.5,
        agentJudgeScore: 0.5,
        agentPassRate: 0.5,
      },
      retrieval: null,
      agent: null,
    });

    const result = await runBenchmark({
      resultsDir,
      runRetrieval: async () =>
        summarizeEval([
          {
            issueId: "eval-01",
            title: "demo",
            query: "q",
            relevantFiles: ["src/a.ts"],
            retrievedFiles: ["src/a.ts"],
            precisionAt1: 1,
            precisionAt5: 1,
            precisionAt10: 1,
            passedAt1: true,
            passedAt5: true,
            passedAt10: true,
          },
        ]),
      runAgent: async () => ({
        summary: summarizeAgentEval([
          {
            issueId: "eval-01",
            title: "demo",
            split: "test",
            correctFiles: ["src/a.ts"],
            modifiedFiles: ["src/a.ts"],
            filePrecision: 1,
            fileRecall: 1,
            testsPassed: true,
            verificationPassed: true,
            prAccepted: true,
            judgeScore: 1,
            judgeRationale: "good",
            agentCompleted: true,
            passed: true,
          },
        ]),
        artifactsByIssue: new Map(),
      }),
    });

    assert.equal(result.comparison.previousRunId, "baseline");
    assert.equal(result.comparison.improved > 0, true);
    assert.match(result.report, /Previous: baseline/);
    assert.equal(result.hasMetricRegressions, false);
  } finally {
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test("runBenchmark flags metric regressions", async () => {
  const resultsDir = await mkdtemp(join(tmpdir(), "benchmark-"));
  try {
    await saveBenchmarkRun(resultsDir, {
      id: "baseline",
      timestamp: "2026-08-30T00:00:00.000Z",
      gitSha: "base",
      split: "test",
      metrics: {
        retrievalMeanP1: 1,
        retrievalMeanP5: 1,
        retrievalMeanP10: 1,
        agentFilePrecision: 1,
        agentFileRecall: 1,
        agentTestPassRate: 1,
        agentPrAcceptanceRate: 1,
        agentJudgeScore: 1,
        agentPassRate: 1,
      },
      retrieval: null,
      agent: null,
    });

    const result = await runBenchmark({
      resultsDir,
      runRetrieval: async () =>
        summarizeEval([
          {
            issueId: "eval-01",
            title: "demo",
            query: "q",
            relevantFiles: ["src/a.ts"],
            retrievedFiles: ["src/x.ts"],
            precisionAt1: 0,
            precisionAt5: 0,
            precisionAt10: 0,
            passedAt1: false,
            passedAt5: false,
            passedAt10: false,
          },
        ]),
      runAgent: async () => ({
        summary: summarizeAgentEval([
          {
            issueId: "eval-01",
            title: "demo",
            split: "test",
            correctFiles: ["src/a.ts"],
            modifiedFiles: ["src/x.ts"],
            filePrecision: 0,
            fileRecall: 0,
            testsPassed: false,
            verificationPassed: false,
            prAccepted: false,
            judgeScore: 0,
            judgeRationale: "bad",
            agentCompleted: true,
            passed: false,
          },
        ]),
        artifactsByIssue: new Map([
          [
            "eval-01",
            {
              modifiedFiles: ["src/x.ts"],
              diff: "diff --git a/src/x.ts",
              agentSummary: "bad fix",
              agentCompleted: true,
              verification: {
                passed: false,
                modifiedFiles: ["src/x.ts"],
                diff: "diff --git a/src/x.ts",
                checks: [{ name: "tests", passed: false, details: "2 failed" }],
              },
            },
          ],
        ]),
      }),
    });

    assert.equal(result.hasMetricRegressions, true);
    assert.equal(result.hasFailures, true);
    assert.equal(result.failureAnalysis.totalFailures, 2);
    assert.match(result.report, /FAILURE ANALYSIS/);
    assert.match(result.report, /Most common:/);
  } finally {
    await rm(resultsDir, { recursive: true, force: true });
  }
});
