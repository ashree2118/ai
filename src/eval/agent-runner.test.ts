import assert from "node:assert/strict";
import test from "node:test";
import { getEvalIssue } from "./dataset/loader.js";
import {
  formatAgentEvalReport,
  runAgentEval,
  scoreAgentIssue,
  type AgentRunArtifacts,
} from "./agent-runner.js";
import type { PRJudgeClient } from "./judge.js";

function mockArtifacts(
  overrides: Partial<AgentRunArtifacts> = {},
): AgentRunArtifacts {
  return {
    modifiedFiles: ["src/index.ts"],
    diff: "diff --git a/src/index.ts",
    agentSummary: "Implemented token counting.",
    agentCompleted: true,
    verification: {
      passed: true,
      modifiedFiles: ["src/index.ts"],
      diff: "diff --git a/src/index.ts",
      checks: [
        { name: "modified_files", passed: true, details: "ok" },
        { name: "tests", passed: true, details: "ok" },
      ],
    },
    ...overrides,
  };
}

test("scoreAgentIssue keeps deterministic metrics separate from judge output", async () => {
  const issue = getEvalIssue("eval-01");
  assert.ok(issue);

  const judgeClient: PRJudgeClient = {
    async judge() {
      return {
        correctness: 0.95,
        completeness: 0.9,
        approachQuality: 0.85,
        accepted: true,
        rationale: "Matches the reference fix.",
      };
    },
  };

  const result = await scoreAgentIssue({
    issue,
    artifacts: mockArtifacts(),
    judgeClient,
  });

  assert.equal(result.filePrecision, 1);
  assert.equal(result.fileRecall, 1);
  assert.equal(result.testsPassed, true);
  assert.equal(result.prAccepted, true);
  assert.ok(result.judgeScore > 0.8);
  assert.equal(result.passed, true);
});

test("scoreAgentIssue can run without LLM judge", async () => {
  const issue = getEvalIssue("eval-02");
  assert.ok(issue);

  const result = await scoreAgentIssue({
    issue,
    artifacts: mockArtifacts({
      modifiedFiles: ["src/conversation.ts"],
      verification: {
        passed: false,
        modifiedFiles: ["src/conversation.ts"],
        diff: "diff",
        checks: [{ name: "tests", passed: false, details: "failed" }],
      },
    }),
    skipJudge: true,
  });

  assert.equal(result.prAccepted, false);
  assert.equal(result.judgeScore, 0);
  assert.equal(result.testsPassed, false);
  assert.equal(result.passed, false);
});

test("runAgentEval aggregates per-issue results from injected artifacts", async () => {
  const judgeClient: PRJudgeClient = {
    async judge(input) {
      const accepted = input.modifiedFiles.includes("src/index.ts");
      return {
        correctness: accepted ? 1 : 0,
        completeness: accepted ? 1 : 0,
        approachQuality: accepted ? 1 : 0,
        accepted,
        rationale: accepted ? "accepted" : "rejected",
      };
    },
  };

  const run = await runAgentEval({
    ids: ["eval-01", "eval-02"],
    runIssue: async (issue) =>
      mockArtifacts({
        modifiedFiles: issue.id === "eval-01" ? ["src/index.ts"] : ["src/x.ts"],
        verification: {
          passed: issue.id === "eval-01",
          modifiedFiles:
            issue.id === "eval-01" ? ["src/index.ts"] : ["src/x.ts"],
          diff: "diff",
          checks: [
            {
              name: "tests",
              passed: issue.id === "eval-01",
              details: "ok",
            },
          ],
        },
      }),
    judgeClient,
  });

  assert.equal(run.summary.issueCount, 2);
  assert.equal(run.summary.testPassRate, 0.5);
  assert.equal(run.summary.prAcceptanceRate, 0.5);
  assert.equal(run.summary.failures.length, 1);
  assert.match(formatAgentEvalReport(run.summary), /mean file precision/);
});
