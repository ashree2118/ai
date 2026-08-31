import { judgeScore, type PRJudgeRubric } from "../eval/judge.js";
import type { ReactAgentResult } from "../react-agent.js";
import type { VerificationResult } from "../verification/runner.js";

export type ConfidenceLevel = "high" | "low";

export type FixConfidence = {
  score: number;
  level: ConfidenceLevel;
  threshold: number;
  rationale: string;
  factors: {
    verificationPassed: boolean;
    testsPassed: boolean;
    agentCompleted: boolean;
    hasChanges: boolean;
    judgeScore: number | null;
  };
};

export function readConfidenceThreshold(option?: number): number {
  if (option !== undefined) return option;
  const fromEnv = process.env.AGENT_FIX_CONFIDENCE_THRESHOLD;
  if (!fromEnv) return 0.7;
  return Number(fromEnv);
}

function testsPassed(verification: VerificationResult): boolean {
  return (
    verification.checks.find((check) => check.name === "tests")?.passed ?? false
  );
}

export function evaluateFixConfidence(input: {
  verification: VerificationResult;
  agentResult: ReactAgentResult;
  judgeRubric?: PRJudgeRubric;
  threshold?: number;
}): FixConfidence {
  const threshold = readConfidenceThreshold(input.threshold);
  const verificationPassed = input.verification.passed;
  const testsOk = testsPassed(input.verification);
  const agentCompleted = input.agentResult.completed;
  const hasChanges = input.verification.modifiedFiles.length > 0;
  const judgeValue = input.judgeRubric ? judgeScore(input.judgeRubric) : null;

  let score = 0;
  if (verificationPassed) score += 0.35;
  if (testsOk) score += 0.25;
  if (agentCompleted) score += 0.15;
  if (hasChanges) score += 0.1;
  if (judgeValue !== null) {
    score += 0.15 * judgeValue;
  } else if (verificationPassed && testsOk) {
    score += 0.1;
  }

  score = Math.min(1, score);

  const high =
    score >= threshold &&
    verificationPassed &&
    hasChanges &&
    agentCompleted;

  const rationaleParts = [
    `score=${score.toFixed(3)} (threshold=${threshold})`,
    verificationPassed ? "verification passed" : "verification failed",
    testsOk ? "tests passed" : "tests failed or skipped",
    agentCompleted ? "agent completed" : "agent incomplete",
    hasChanges
      ? `${input.verification.modifiedFiles.length} file(s) changed`
      : "no file changes",
  ];
  if (judgeValue !== null) {
    rationaleParts.push(`judge=${judgeValue.toFixed(3)}`);
  }
  if (input.judgeRubric?.rationale) {
    rationaleParts.push(input.judgeRubric.rationale);
  }

  return {
    score,
    level: high ? "high" : "low",
    threshold,
    rationale: rationaleParts.join("; "),
    factors: {
      verificationPassed,
      testsPassed: testsOk,
      agentCompleted,
      hasChanges,
      judgeScore: judgeValue,
    },
  };
}

export function formatLowConfidenceComment(input: {
  issueNumber: number;
  confidence: FixConfidence;
  agentSummary: string;
  verification: VerificationResult;
}): string {
  const failedChecks = input.verification.checks
    .filter((check) => !check.passed)
    .map((check) => `- ${check.name}: ${check.details.slice(0, 200)}`);

  return [
    "## Agent fix attempt (low confidence)",
    "",
    `I analyzed issue #${input.issueNumber} but confidence was **low** (${input.confidence.score.toFixed(3)} < ${input.confidence.threshold}).`,
    "",
    "### Summary",
    input.agentSummary.trim() || "_No agent summary provided._",
    "",
    "### Confidence",
    input.confidence.rationale,
    "",
    ...(failedChecks.length > 0
      ? ["### Failed checks", ...failedChecks, ""]
      : []),
    "_No pull request was opened automatically. A maintainer can review the notes above and re-run the agent after refining the issue._",
  ].join("\n");
}

export function formatDraftPrBody(input: {
  issueNumber: number;
  issueUrl: string;
  confidence: FixConfidence;
  agentSummary: string;
}): string {
  return [
    `Automated fix for #${input.issueNumber}.`,
    "",
    `Closes #${input.issueNumber}`,
    "",
    "## Agent summary",
    input.agentSummary.trim() || "_No agent summary provided._",
    "",
    "## Confidence",
    `- score: ${input.confidence.score.toFixed(3)}`,
    `- threshold: ${input.confidence.threshold}`,
    `- rationale: ${input.confidence.rationale}`,
    "",
    `Issue: ${input.issueUrl}`,
    "",
    "_This is a draft PR created by the agent-fix workflow. It will never be auto-merged._",
  ].join("\n");
}
