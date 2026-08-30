import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTraceRecord } from "../trace/agent-trace.js";
import type { AgentRunArtifacts } from "./agent-runner.js";
import {
  analyzeEvalFailures,
  buildAgentFailureRecord,
  buildRetrievalFailureRecord,
  classifyAgentFailure,
  formatFailureReport,
  summarizeFailureCategories,
} from "./failure-analysis.js";
import type { AgentIssueEvalResult } from "./metrics.js";

function agentResult(
  overrides: Partial<AgentIssueEvalResult> = {},
): AgentIssueEvalResult {
  return {
    issueId: "eval-01",
    title: "demo issue",
    split: "test",
    correctFiles: ["src/a.ts", "src/b.ts"],
    modifiedFiles: ["src/a.ts"],
    filePrecision: 1,
    fileRecall: 0.5,
    testsPassed: true,
    verificationPassed: true,
    prAccepted: true,
    judgeScore: 0.9,
    judgeRationale: "ok",
    agentCompleted: true,
    passed: false,
    ...overrides,
  };
}

function artifacts(
  overrides: Partial<AgentRunArtifacts> = {},
): AgentRunArtifacts {
  return {
    modifiedFiles: ["src/a.ts"],
    diff: "diff --git a/src/a.ts",
    agentSummary: "done",
    agentCompleted: true,
    ...overrides,
  };
}

const toolErrorTrace: AgentTraceRecord = {
  issueId: "eval-01",
  startedAt: "2026-08-30T00:00:00.000Z",
  iterations: [
    {
      iteration: 1,
      assistantText: "read file",
      stopReason: "tool_use",
      usage: { inputTokens: 1, outputTokens: 1 },
      cumulativeTokens: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      toolCalls: [{ iteration: 1, toolUseId: "1", name: "read_file", input: {} }],
      toolResults: [
        {
          iteration: 1,
          toolUseId: "1",
          name: "read_file",
          ok: false,
          output: "file not found",
        },
      ],
    },
  ],
  outcome: {
    completed: true,
    stopReason: "end_turn",
    finalText: "failed",
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  },
};

test("classifyAgentFailure picks test failures", () => {
  const result = classifyAgentFailure({
    result: agentResult({ testsPassed: false, passed: false }),
    artifacts: artifacts({
      verification: {
        passed: false,
        modifiedFiles: ["src/a.ts"],
        diff: "diff",
        checks: [{ name: "tests", passed: false, details: "2 failing tests" }],
      },
    }),
  });

  assert.equal(result.category, "test");
  assert.match(result.summary, /2 failing tests/);
});

test("classifyAgentFailure picks edit failures for wrong files", () => {
  const result = classifyAgentFailure({
    result: agentResult({
      fileRecall: 0.5,
      modifiedFiles: ["src/a.ts"],
      passed: false,
    }),
    artifacts: artifacts(),
  });

  assert.equal(result.category, "edit");
  assert.match(result.summary, /missing src\/b\.ts/);
});

test("classifyAgentFailure picks tool failures from trace", () => {
  const result = classifyAgentFailure({
    result: agentResult({ passed: false }),
    artifacts: artifacts({ trace: toolErrorTrace }),
  });

  assert.equal(result.category, "tool");
  assert.match(result.summary, /read_file/);
});

test("classifyAgentFailure picks termination when agent does not complete", () => {
  const result = classifyAgentFailure({
    result: agentResult({ agentCompleted: false, passed: false }),
    artifacts: artifacts({
      agentCompleted: false,
      trace: {
        issueId: "eval-01",
        startedAt: "t",
        iterations: [],
        outcome: {
          completed: false,
          stopReason: "max_iterations",
          partialReason: "max_iterations reached",
          finalText: "",
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    }),
  });

  assert.equal(result.category, "termination");
});

test("buildRetrievalFailureRecord captures retrieval taxonomy", () => {
  const record = buildRetrievalFailureRecord({
    issueId: "eval-05",
    title: "rag miss",
    query: "find store",
    relevantFiles: ["src/rag/store.ts"],
    retrievedFiles: ["src/tools.ts"],
    precisionAt1: 0,
    precisionAt5: 0,
    precisionAt10: 0,
    passedAt1: false,
    passedAt5: false,
    passedAt10: false,
  });

  assert.equal(record.category, "retrieval");
  assert.match(record.summary, /src\/rag\/store\.ts/);
});

test("analyzeEvalFailures aggregates most common category", () => {
  const report = analyzeEvalFailures({
    retrievalFailures: [
      {
        issueId: "eval-10",
        title: "miss",
        query: "q",
        relevantFiles: ["src/a.ts"],
        retrievedFiles: [],
        precisionAt1: 0,
        precisionAt5: 0,
        precisionAt10: 0,
        passedAt1: false,
        passedAt5: false,
        passedAt10: false,
      },
    ],
    agentFailures: [
      agentResult({ issueId: "eval-11", testsPassed: false, passed: false }),
      agentResult({ issueId: "eval-12", testsPassed: false, passed: false }),
    ],
    artifactsByIssue: new Map([
      [
        "eval-11",
        artifacts({
          verification: {
            passed: false,
            modifiedFiles: [],
            diff: "",
            checks: [{ name: "tests", passed: false, details: "fail" }],
          },
        }),
      ],
      [
        "eval-12",
        artifacts({
          verification: {
            passed: false,
            modifiedFiles: [],
            diff: "",
            checks: [{ name: "tests", passed: false, details: "fail" }],
          },
        }),
      ],
    ]),
  });

  assert.equal(report.totalFailures, 3);
  assert.equal(report.mostCommonCategory, "test");
  assert.equal(report.byCategory.test, 2);
  assert.equal(report.byCategory.retrieval, 1);
  assert.match(formatFailureReport(report), /Most common:\s+test/);
});

test("buildAgentFailureRecord captures trace diff and test output", () => {
  const record = buildAgentFailureRecord({
    result: agentResult({ testsPassed: false, passed: false }),
    artifacts: artifacts({
      diff: "diff --git a/src/a.ts b/src/a.ts",
      trace: toolErrorTrace,
      verification: {
        passed: false,
        modifiedFiles: ["src/a.ts"],
        diff: "diff --git a/src/a.ts b/src/a.ts",
        checks: [{ name: "tests", passed: false, details: "assertion failed" }],
      },
    }),
  });

  assert.equal(record.testOutput, "assertion failed");
  assert.match(record.diff, /diff --git/);
  assert.ok(record.traceMarkdown.includes("Iteration 1"));
});

test("summarizeFailureCategories handles empty input", () => {
  const summary = summarizeFailureCategories([]);
  assert.equal(summary.mostCommonCategory, null);
});
