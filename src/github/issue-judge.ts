import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  parseJudgeRubric,
  type PRJudgeRubric,
} from "../eval/judge.js";

export type IssueFixJudgeInput = {
  title: string;
  issueBody: string;
  agentSummary: string;
  diff: string;
  modifiedFiles: string[];
};

const ISSUE_JUDGE_SYSTEM = `You are an expert code review judge for an automated GitHub issue-fixing agent.
Score the agent's proposed fix against the issue description and acceptance criteria.

Respond with ONLY valid JSON matching this schema:
{
  "correctness": <number 0-1>,
  "completeness": <number 0-1>,
  "approachQuality": <number 0-1>,
  "accepted": <boolean>,
  "rationale": "<short explanation>"
}

Rubric:
- correctness: Does the diff fix the reported problem without obvious regressions?
- completeness: Does the change satisfy the stated acceptance criteria?
- approachQuality: Is the implementation approach reasonable for this repository?
- accepted: true only if you would merge this PR (typically correctness >= 0.7 and completeness >= 0.7).`;

function extractText(content: Message["content"]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function buildIssueJudgePrompt(input: IssueFixJudgeInput): string {
  return [
    "# Issue",
    `Title: ${input.title}`,
    input.issueBody,
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

export async function judgeIssueFix(
  input: IssueFixJudgeInput,
  options?: { client?: Anthropic; model?: string },
): Promise<PRJudgeRubric> {
  const client = options?.client ?? new Anthropic();
  const model =
    options?.model ??
    process.env.AGENT_FIX_JUDGE_MODEL ??
    process.env.EVAL_JUDGE_MODEL ??
    "claude-sonnet-4-20250514";

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: ISSUE_JUDGE_SYSTEM,
    messages: [{ role: "user", content: buildIssueJudgePrompt(input) }],
  });

  return parseJudgeRubric(extractText(response.content));
}
