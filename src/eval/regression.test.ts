import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compareBenchmarkRuns,
  extractBenchmarkMetrics,
  formatRegressionReport,
  hasRegressions,
  loadLatestRun,
  listRuns,
  saveBenchmarkRun,
  type BenchmarkRunRecord,
} from "./regression.js";
import { summarizeAgentEval, summarizeEval, type AgentIssueEvalResult } from "./metrics.js";

function sampleRecord(
  overrides: Partial<BenchmarkRunRecord> = {},
): BenchmarkRunRecord {
  return {
    id: "2026-08-30T00-00-00-000Z",
    timestamp: "2026-08-30T00:00:00.000Z",
    gitSha: "abc1234",
    split: "test",
    metrics: {
      retrievalMeanP1: 0.8,
      retrievalMeanP5: 0.7,
      retrievalMeanP10: 0.6,
      agentFilePrecision: 0.9,
      agentFileRecall: 0.8,
      agentTestPassRate: 0.7,
      agentPrAcceptanceRate: 0.6,
      agentJudgeScore: 0.75,
      agentPassRate: 0.5,
    },
    retrieval: null,
    agent: null,
    ...overrides,
  };
}

test("extractBenchmarkMetrics maps retrieval and agent summaries", () => {
  const retrieval = summarizeEval([
    {
      issueId: "a",
      title: "a",
      query: "q",
      relevantFiles: ["src/a.ts"],
      retrievedFiles: ["src/a.ts"],
      precisionAt1: 1,
      precisionAt5: 0.5,
      precisionAt10: 0.25,
      passedAt1: true,
      passedAt5: true,
      passedAt10: true,
    },
  ]);

  const agent = summarizeAgentEval([
    {
      issueId: "eval-01",
      title: "one",
      split: "test",
      correctFiles: ["src/a.ts"],
      modifiedFiles: ["src/a.ts"],
      filePrecision: 1,
      fileRecall: 1,
      testsPassed: true,
      verificationPassed: true,
      prAccepted: true,
      judgeScore: 0.9,
      judgeRationale: "ok",
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
  ] satisfies AgentIssueEvalResult[]);

  const metrics = extractBenchmarkMetrics(retrieval, agent);
  assert.equal(metrics.retrievalMeanP1, 1);
  assert.equal(metrics.agentTestPassRate, 0.5);
  assert.equal(metrics.agentPassRate, 0.5);
});

test("compareBenchmarkRuns detects improvements and regressions", () => {
  const previous = sampleRecord().metrics;
  const current = {
    ...previous,
    retrievalMeanP10: (previous.retrievalMeanP10 ?? 0) + 0.1,
    agentTestPassRate: (previous.agentTestPassRate ?? 0) - 0.2,
  };

  const comparison = compareBenchmarkRuns(current, previous);
  assert.equal(
    comparison.deltas.find((delta) => delta.key === "retrievalMeanP10")?.status,
    "improved",
  );
  assert.equal(
    comparison.deltas.find((delta) => delta.key === "agentTestPassRate")?.status,
    "regressed",
  );
  assert.equal(hasRegressions(comparison), true);
});

test("compareBenchmarkRuns marks first-run metrics as new", () => {
  const comparison = compareBenchmarkRuns(sampleRecord().metrics, null);
  assert.ok(comparison.deltas.every((delta) => delta.status === "new"));
  assert.equal(hasRegressions(comparison), false);
});

test("saveBenchmarkRun writes versioned and latest records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eval-results-"));
  try {
    const record = sampleRecord({ id: "run-001" });
    const runPath = await saveBenchmarkRun(dir, record);
    assert.match(runPath, /run-001\.json$/);

    const latest = await loadLatestRun(dir);
    assert.equal(latest?.id, "run-001");

    const runs = await listRuns(dir);
    assert.deepEqual(runs, ["run-001"]);

    const raw = await readFile(join(dir, "latest.json"), "utf8");
    assert.match(raw, /"retrievalMeanP10": 0.6/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("formatRegressionReport renders clear score output", () => {
  const record = sampleRecord();
  const comparison = compareBenchmarkRuns(record.metrics, null);
  const report = formatRegressionReport(record, comparison);

  assert.match(report, /EVAL BENCHMARK/);
  assert.match(report, /Retrieval P@10/);
  assert.match(report, /Test pass rate/);
  assert.match(report, /SUMMARY/);
});
