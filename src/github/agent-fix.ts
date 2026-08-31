import { buildUserTask, createContextBuilder } from "../context/gather.js";
import { ReactAgent } from "../react-agent.js";
import { TOOLS as WORKSPACE_TOOLS } from "../tools.js";
import { runVerification, type VerificationResult } from "../verification/runner.js";
import {
  evaluateFixConfidence,
  formatDraftPrBody,
  formatLowConfidenceComment,
  type FixConfidence,
} from "./confidence.js";
import {
  buildAgentFixBranch,
  publishDraftPullRequest,
} from "./git-publish.js";
import { judgeIssueFix } from "./issue-judge.js";
import {
  createGithubClient,
  fetchGithubIssue,
  getDefaultBranch,
  postIssueComment,
  type GithubIssueRef,
} from "./toolkit.js";

export const AGENT_FIX_LABEL = "agent-fix";

export const AGENT_FIX_SYSTEM_PROMPT = `You are a coding agent fixing a GitHub issue in a checked-out local repository.
Use list_files, read_file, and run_command to explore, edit, and test locally.
Do not open pull requests, create branches on GitHub, or push changes — the workflow publishes verified changes after you finish.
Make minimal, correct changes and summarize what you changed and why in your final answer.`;

export const AGENT_FIX_TASK =
  "Fix the GitHub issue described in context. Make minimal, correct changes and run relevant tests when possible.";

export type AgentFixInput = {
  owner: string;
  repo: string;
  issueNumber: number;
  repoRoot?: string;
  confidenceThreshold?: number;
  skipJudge?: boolean;
  skipVerification?: boolean;
  maxIterations?: number;
  maxTokenBudget?: number;
  log?: (message: string) => void;
};

export type AgentFixDraftPrOutcome = {
  action: "draft_pr";
  issue: GithubIssueRef;
  confidence: FixConfidence;
  verification: VerificationResult;
  branch: string;
  prNumber: number;
  prUrl: string;
  agentSummary: string;
};

export type AgentFixCommentOutcome = {
  action: "comment";
  issue: GithubIssueRef;
  confidence: FixConfidence;
  verification: VerificationResult;
  commentUrl: string;
  agentSummary: string;
};

export type AgentFixOutcome = AgentFixDraftPrOutcome | AgentFixCommentOutcome;

function resolveRepoFromEnv(): { owner: string; repo: string } {
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository?.includes("/")) {
    const [owner, repo] = repository.split("/", 2);
    if (owner && repo) return { owner, repo };
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) {
    throw new Error(
      "Set GITHUB_REPOSITORY or both GITHUB_OWNER and GITHUB_REPO",
    );
  }
  return { owner, repo };
}

export function readAgentFixIssueNumber(option?: number): number {
  if (option !== undefined) return option;
  const fromEnv = process.env.AGENT_FIX_ISSUE_NUMBER;
  if (!fromEnv) {
    throw new Error("AGENT_FIX_ISSUE_NUMBER is not set");
  }
  const issueNumber = Number(fromEnv);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error(`Invalid AGENT_FIX_ISSUE_NUMBER: ${fromEnv}`);
  }
  return issueNumber;
}

export function shouldRunAgentFixForLabel(labelName: string): boolean {
  return labelName === AGENT_FIX_LABEL;
}

export async function runAgentFix(
  input: AgentFixInput,
): Promise<AgentFixOutcome> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const log = input.log ?? ((message: string) => console.error(message));
  const octokit = createGithubClient();

  const issue = await fetchGithubIssue(
    octokit,
    input.owner,
    input.repo,
    input.issueNumber,
  );
  log(`[agent-fix] loaded issue #${issue.number}: ${issue.title}`);

  const contextBuilder = await createContextBuilder({
    task: AGENT_FIX_TASK,
    issueNumber: input.issueNumber,
    repoRoot,
  });

  const agent = new ReactAgent({
    system: AGENT_FIX_SYSTEM_PROMPT,
    dynamicSystem: (messages) => contextBuilder.buildSystem(messages),
    tools: WORKSPACE_TOOLS,
    maxIterations: input.maxIterations,
    maxTokenBudget: input.maxTokenBudget,
    enableScratchpad: true,
    enableContextManagement: true,
    langfuseRunId: `agent-fix-${input.owner}-${input.repo}-${input.issueNumber}`,
    log,
  });

  log(`[agent-fix] running agent for issue #${input.issueNumber}`);
  const agentResult = await agent.run(buildUserTask(AGENT_FIX_TASK));
  const agentSummary = agentResult.text.trim();

  const verification = input.skipVerification
    ? {
        passed: false,
        modifiedFiles: [],
        diff: "",
        checks: [
          {
            name: "verification",
            passed: false,
            details: "Verification skipped",
          },
        ],
      }
    : await runVerification({ repoRoot });

  log(
    `[agent-fix] verification ${verification.passed ? "passed" : "failed"} (${verification.modifiedFiles.length} files)`,
  );

  let judgeRubric;
  const skipJudge =
    input.skipJudge ?? process.env.AGENT_FIX_SKIP_JUDGE === "1";
  if (!skipJudge && process.env.ANTHROPIC_API_KEY) {
    try {
      judgeRubric = await judgeIssueFix({
        title: issue.title,
        issueBody: issue.body,
        agentSummary,
        diff: verification.diff,
        modifiedFiles: verification.modifiedFiles,
      });
      log(
        `[agent-fix] judge score ${(
          (judgeRubric.correctness +
            judgeRubric.completeness +
            judgeRubric.approachQuality) /
          3
        ).toFixed(3)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[agent-fix] judge skipped: ${message}`);
    }
  }

  const confidence = evaluateFixConfidence({
    verification,
    agentResult,
    judgeRubric,
    threshold: input.confidenceThreshold,
  });
  log(`[agent-fix] confidence ${confidence.level} (${confidence.score.toFixed(3)})`);

  if (confidence.level === "high") {
    const baseBranch = await getDefaultBranch(octokit, input.owner, input.repo);
    const branch = buildAgentFixBranch(input.issueNumber);
    const pr = await publishDraftPullRequest({
      owner: input.owner,
      repo: input.repo,
      issue,
      branch,
      baseBranch,
      title: `fix: ${issue.title}`,
      body: formatDraftPrBody({
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        confidence,
        agentSummary,
      }),
      commitMessage: `fix: ${issue.title}\n\nAutomated fix for #${issue.number}`,
      repoRoot,
    });

    return {
      action: "draft_pr",
      issue,
      confidence,
      verification,
      branch: pr.branch,
      prNumber: pr.prNumber,
      prUrl: pr.prUrl,
      agentSummary,
    };
  }

  const comment = await postIssueComment(octokit, {
    owner: input.owner,
    repo: input.repo,
    issue_number: input.issueNumber,
    body: formatLowConfidenceComment({
      issueNumber: issue.number,
      confidence,
      agentSummary,
      verification,
    }),
  });

  return {
    action: "comment",
    issue,
    confidence,
    verification,
    commentUrl: comment.html_url,
    agentSummary,
  };
}

export async function runAgentFixFromEnv(
  options: Omit<AgentFixInput, "owner" | "repo" | "issueNumber"> & {
    owner?: string;
    repo?: string;
    issueNumber?: number;
  } = {},
): Promise<AgentFixOutcome> {
  const { owner, repo } = resolveRepoFromEnv();
  return runAgentFix({
    owner: options.owner ?? owner,
    repo: options.repo ?? repo,
    issueNumber: readAgentFixIssueNumber(options.issueNumber),
    repoRoot: options.repoRoot,
    confidenceThreshold: options.confidenceThreshold,
    skipJudge: options.skipJudge,
    skipVerification: options.skipVerification,
    maxIterations: options.maxIterations,
    maxTokenBudget: options.maxTokenBudget,
    log: options.log,
  });
}

export function formatAgentFixOutcome(outcome: AgentFixOutcome): string {
  if (outcome.action === "draft_pr") {
    return [
      `action=draft_pr`,
      `issue=#${outcome.issue.number}`,
      `confidence=${outcome.confidence.score.toFixed(3)}`,
      `branch=${outcome.branch}`,
      `pr=${outcome.prUrl}`,
    ].join("\n");
  }

  return [
    `action=comment`,
    `issue=#${outcome.issue.number}`,
    `confidence=${outcome.confidence.score.toFixed(3)}`,
    `comment=${outcome.commentUrl}`,
  ].join("\n");
}
