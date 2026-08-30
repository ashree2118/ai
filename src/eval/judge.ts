import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import type { AgentEvalIssue } from "./dataset/types.js";

export type PRJudgeRubric = {
  correctness: number;
  completeness: number;
  approachQuality: number;
  accepted: boolean;
  rationale: string;
};

export type PRJudgeInput = {
  issue: AgentEvalIssue;
  agentSummary: string;
  diff: string;
  modifiedFiles: string[];
};

export type PRJudgeClient = {
  judge(input: PRJudgeInput): Promise<PRJudgeRubric>;
};

const JUDGE_SYSTEM = `You are an expert code review judge for an automated coding agent evaluation.
Score the agent's proposed fix against the issue description, acceptance criteria, and reference fix.

Respond with ONLY valid JSON matching this schema:
{
  "correctness": <number 0-1>,
  "completeness": <number 0-1>,
  "approachQuality": <number 0-1>,
  "accepted": <boolean>,
  "rationale": "<short explanation>"
}

Rubric:
- correctness: Does the diff fix the reported problem without introducing obvious regressions?
- completeness: Does the change satisfy the stated acceptance criteria?
- approachQuality: Is the implementation approach reasonable relative to the reference fix summary?
- accepted: true only if you would merge this PR (typically correctness >= 0.7 and completeness >= 0.7).`;

function extractText(content: Message["content"]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function clampScore(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

export function buildJudgePrompt(input: PRJudgeInput): string {
  return [
    "# Issue",
    `Title: ${input.issue.title}`,
    input.issue.issueText,
    "",
    "# Reference fix",
    `Commit: ${input.issue.referenceFix.commit}`,
    `Summary: ${input.issue.referenceFix.summary}`,
    `Expected approach: ${input.issue.approach}`,
    `Expected files: ${input.issue.correctFiles.join(", ")}`,
    "",
    "# Agent output",
    `Modified files: ${input.modifiedFiles.join(", ") || "(none)"}`,
    "",
    "## Agent summary",
    input.agentSummary.trim() || "(none)",
    "",
    "## Git diff",
    input.diff.trim() || "(empty)",
  ].join("\n");
}

export function parseJudgeRubric(text: string): PRJudgeRubric {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Judge response did not contain JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<PRJudgeRubric>;
  return {
    correctness: clampScore(parsed.correctness),
    completeness: clampScore(parsed.completeness),
    approachQuality: clampScore(parsed.approachQuality),
    accepted: Boolean(parsed.accepted),
    rationale:
      typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "No rationale provided.",
  };
}

export function judgeScore(rubric: PRJudgeRubric): number {
  return (rubric.correctness + rubric.completeness + rubric.approachQuality) / 3;
}

export function createAnthropicJudgeClient(options?: {
  client?: Anthropic;
  model?: string;
}): PRJudgeClient {
  const client = options?.client ?? new Anthropic();
  const model =
    options?.model ??
    process.env.EVAL_JUDGE_MODEL ??
    "claude-sonnet-4-20250514";

  return {
    async judge(input: PRJudgeInput): Promise<PRJudgeRubric> {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: buildJudgePrompt(input) }],
      });
      return parseJudgeRubric(extractText(response.content));
    },
  };
}
