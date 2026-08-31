import assert from "node:assert/strict";
import test from "node:test";
import { emptyCostTotals } from "../cost/pricing.js";
import { emptyTokenUsage } from "../guardrails.js";
import type { ReactAgentResult } from "../react-agent.js";
import type { VerificationResult } from "../verification/runner.js";
import {
  evaluateFixConfidence,
  formatDraftPrBody,
  formatLowConfidenceComment,
  readConfidenceThreshold,
} from "./confidence.js";
import {
  AGENT_FIX_LABEL,
  shouldRunAgentFixForLabel,
} from "./agent-fix.js";

function agentResult(overrides: Partial<ReactAgentResult> = {}): ReactAgentResult {
  return {
    text: "Updated handler and added test.",
    iterations: 3,
    stopReason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 } as ReactAgentResult["usage"],
    tokenUsage: emptyTokenUsage(),
    costUsage: emptyCostTotals(),
    completed: true,
    messages: [],
    ...overrides,
  };
}

function verification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    passed: true,
    modifiedFiles: ["src/fix.ts"],
    diff: "diff --git a/src/fix.ts",
    checks: [
      { name: "modified_files", passed: true, details: "ok" },
      { name: "git_diff", passed: true, details: "ok" },
      { name: "typecheck", passed: true, details: "ok" },
      { name: "tests", passed: true, details: "ok" },
    ],
    ...overrides,
  };
}

test("readConfidenceThreshold defaults to 0.7", () => {
  const previous = process.env.AGENT_FIX_CONFIDENCE_THRESHOLD;
  delete process.env.AGENT_FIX_CONFIDENCE_THRESHOLD;
  try {
    assert.equal(readConfidenceThreshold(), 0.7);
    process.env.AGENT_FIX_CONFIDENCE_THRESHOLD = "0.85";
    assert.equal(readConfidenceThreshold(), 0.85);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_FIX_CONFIDENCE_THRESHOLD;
    } else {
      process.env.AGENT_FIX_CONFIDENCE_THRESHOLD = previous;
    }
  }
});

test("evaluateFixConfidence marks strong fixes as high", () => {
  const confidence = evaluateFixConfidence({
    verification: verification(),
    agentResult: agentResult(),
    judgeRubric: {
      correctness: 0.9,
      completeness: 0.85,
      approachQuality: 0.8,
      accepted: true,
      rationale: "Looks good",
    },
    threshold: 0.7,
  });

  assert.equal(confidence.level, "high");
  assert.ok(confidence.score >= 0.7);
  assert.equal(confidence.factors.verificationPassed, true);
});

test("evaluateFixConfidence marks failed verification as low", () => {
  const confidence = evaluateFixConfidence({
    verification: verification({
      passed: false,
      checks: [
        { name: "tests", passed: false, details: "failed" },
      ],
    }),
    agentResult: agentResult({ completed: false }),
    threshold: 0.7,
  });

  assert.equal(confidence.level, "low");
});

test("formatLowConfidenceComment includes summary and rationale", () => {
  const body = formatLowConfidenceComment({
    issueNumber: 42,
    confidence: evaluateFixConfidence({
      verification: verification({ passed: false }),
      agentResult: agentResult(),
      threshold: 0.7,
    }),
    agentSummary: "Tried to patch parser.",
    verification: verification({ passed: false }),
  });

  assert.match(body, /issue #42/i);
  assert.match(body, /Tried to patch parser/);
  assert.match(body, /No pull request was opened/i);
});

test("formatDraftPrBody references issue and draft workflow", () => {
  const body = formatDraftPrBody({
    issueNumber: 7,
    issueUrl: "https://github.com/acme/demo/issues/7",
    confidence: evaluateFixConfidence({
      verification: verification(),
      agentResult: agentResult(),
      threshold: 0.7,
    }),
    agentSummary: "Fixed null guard.",
  });

  assert.match(body, /Closes #7/);
  assert.match(body, /never be auto-merged/i);
  assert.match(body, /Fixed null guard/);
});

test("shouldRunAgentFixForLabel matches agent-fix label only", () => {
  assert.equal(shouldRunAgentFixForLabel(AGENT_FIX_LABEL), true);
  assert.equal(shouldRunAgentFixForLabel("bug"), false);
});
