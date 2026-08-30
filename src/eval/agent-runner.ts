import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildUserTask, createContextBuilder } from "../context/gather.js";
import { ensureGithubMcp } from "../mcp/connect.js";
import { ReactAgent } from "../react-agent.js";
import { AgentTrace, type AgentTraceRecord } from "../trace/agent-trace.js";
import { runVerification, type VerificationResult } from "../verification/runner.js";
import {
  loadEvalIssues,
  toEvalQuery,
  type AgentEvalIssue,
  type EvalSplit,
} from "./dataset/loader.js";
import {
  createAnthropicJudgeClient,
  judgeScore,
  type PRJudgeClient,
  type PRJudgeRubric,
} from "./judge.js";
import {
  evaluateDeterministicAgent,
  normalizeFilePath,
  summarizeAgentEval,
  type AgentEvalSummary,
  type AgentIssueEvalResult,
} from "./metrics.js";

export type AgentRunArtifacts = {
  modifiedFiles: string[];
  diff: string;
  agentSummary: string;
  agentCompleted: boolean;
  verification?: VerificationResult;
  trace?: AgentTraceRecord;
  traceMarkdown?: string;
};

export type AgentEvalRunResult = {
  summary: AgentEvalSummary;
  artifactsByIssue: Map<string, AgentRunArtifacts>;
};

export type ScoreAgentIssueOptions = {
  issue: AgentEvalIssue;
  artifacts: AgentRunArtifacts;
  judgeClient?: PRJudgeClient;
  skipJudge?: boolean;
  repoRoot?: string;
};

export type RunAgentEvalOptions = {
  split?: EvalSplit | "all";
  ids?: string[];
  runIssue?: (issue: AgentEvalIssue) => Promise<AgentRunArtifacts>;
  artifactsDir?: string;
  judgeClient?: PRJudgeClient;
  skipJudge?: boolean;
  skipRun?: boolean;
  repoRoot?: string;
  maxIterations?: number;
  maxTokenBudget?: number;
  ragTopK?: number;
  githubMcp?: boolean;
  onProgress?: (message: string) => void;
};

export function toAgentTask(issue: AgentEvalIssue): string {
  return [
    `Fix the following issue in ${issue.repository.owner}/${issue.repository.repo}.`,
    issue.issueText,
    "Implement the fix, run tests, and summarize the changes you made.",
  ].join("\n\n");
}

export function formatAgentEvalReport(summary: AgentEvalSummary): string {
  const lines = [
    "# Agent evaluation report",
    "",
    `issues: ${summary.issueCount}`,
    `mean file precision: ${summary.meanFilePrecision.toFixed(4)}`,
    `mean file recall:    ${summary.meanFileRecall.toFixed(4)}`,
    `test pass rate:      ${summary.testPassRate.toFixed(4)}`,
    `PR acceptance rate:  ${summary.prAcceptanceRate.toFixed(4)}`,
    `mean judge score:    ${summary.meanJudgeScore.toFixed(4)}`,
    "",
    "## Per-issue results",
  ];

  for (const result of summary.results) {
    lines.push(
      `- ${result.issueId} [${result.split}] ${result.title}`,
      `  precision=${result.filePrecision.toFixed(4)} recall=${result.fileRecall.toFixed(4)} tests=${result.testsPassed ? "pass" : "fail"} pr=${result.prAccepted ? "accepted" : "rejected"} judge=${result.judgeScore.toFixed(4)}`,
      `  modified: ${result.modifiedFiles.join(", ") || "(none)"}`,
      `  expected: ${result.correctFiles.join(", ")}`,
    );
    if (result.judgeRationale) {
      lines.push(`  rationale: ${result.judgeRationale}`);
    }
  }

  if (summary.failures.length > 0) {
    lines.push("", "## Failures", ...summary.failures.map((result) => `- ${result.issueId}`));
  }

  return lines.join("\n");
}

function buildAgentIssueResult(input: {
  issue: AgentEvalIssue;
  modifiedFiles: string[];
  deterministic: ReturnType<typeof evaluateDeterministicAgent>;
  rubric?: PRJudgeRubric;
  agentCompleted: boolean;
}): AgentIssueEvalResult {
  const prAccepted = input.rubric?.accepted ?? false;
  const judgeScoreValue = input.rubric ? judgeScore(input.rubric) : 0;
  const passed = input.deterministic.testsPassed && prAccepted;

  return {
    issueId: input.issue.id,
    title: input.issue.title,
    split: input.issue.split,
    correctFiles: input.issue.correctFiles.map(normalizeFilePath),
    modifiedFiles: input.modifiedFiles.map(normalizeFilePath),
    filePrecision: input.deterministic.filePrecision,
    fileRecall: input.deterministic.fileRecall,
    testsPassed: input.deterministic.testsPassed,
    verificationPassed: input.deterministic.verificationPassed,
    prAccepted,
    judgeScore: judgeScoreValue,
    judgeRationale: input.rubric?.rationale ?? "",
    agentCompleted: input.agentCompleted,
    passed,
  };
}

export async function scoreAgentIssue(
  options: ScoreAgentIssueOptions,
): Promise<AgentIssueEvalResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const verification =
    options.artifacts.verification ??
    (await runVerification({ repoRoot }));
  const modifiedFiles =
    verification.modifiedFiles.length > 0
      ? verification.modifiedFiles
      : options.artifacts.modifiedFiles;

  const deterministic = evaluateDeterministicAgent({
    correctFiles: options.issue.correctFiles,
    modifiedFiles,
    checks: verification.checks,
    verificationPassed: verification.passed,
  });

  let rubric: PRJudgeRubric | undefined;
  if (!options.skipJudge && options.judgeClient) {
    rubric = await options.judgeClient.judge({
      issue: options.issue,
      agentSummary: options.artifacts.agentSummary,
      diff: verification.diff || options.artifacts.diff,
      modifiedFiles,
    });
  }

  return buildAgentIssueResult({
    issue: options.issue,
    modifiedFiles,
    deterministic,
    rubric,
    agentCompleted: options.artifacts.agentCompleted,
  });
}

async function loadArtifactsFromDir(
  artifactsDir: string,
  issueId: string,
): Promise<AgentRunArtifacts> {
  const filePath = join(artifactsDir, `${issueId}.artifacts.json`);
  const raw = await readFile(filePath, "utf8");
  const artifacts = JSON.parse(raw) as AgentRunArtifacts;

  if (!artifacts.trace) {
    for (const traceFile of [`${issueId}.trace.json`, `${issueId}.json`]) {
      try {
        const traceRaw = await readFile(join(artifactsDir, traceFile), "utf8");
        artifacts.trace = JSON.parse(traceRaw) as AgentTraceRecord;
        break;
      } catch {
        // optional sidecar trace
      }
    }
  }

  if (!artifacts.traceMarkdown) {
    try {
      artifacts.traceMarkdown = await readFile(
        join(artifactsDir, `${issueId}.trace.md`),
        "utf8",
      );
    } catch {
      // optional markdown trace
    }
  }

  return artifacts;
}

export async function runAgentForEvalIssue(
  issue: AgentEvalIssue,
  options: Pick<
    RunAgentEvalOptions,
    "repoRoot" | "maxIterations" | "maxTokenBudget" | "ragTopK" | "githubMcp" | "onProgress"
  > = {},
): Promise<AgentRunArtifacts> {
  const log = options.onProgress ?? ((message: string) => console.error(message));
  await ensureGithubMcp(options.githubMcp);

  const contextBuilder = await createContextBuilder({
    task: toAgentTask(issue),
    issueText: `# ${issue.title}\n\n${issue.issueText}`,
    ragTopK: options.ragTopK ?? 5,
    repoRoot: options.repoRoot,
  });

  const trace = new AgentTrace(issue.id);
  const agent = new ReactAgent({
    dynamicSystem: (messages) => contextBuilder.buildSystem(messages),
    maxIterations: options.maxIterations ?? 8,
    maxTokenBudget: options.maxTokenBudget ?? 20_000,
    enableScratchpad: true,
    enableContextManagement: true,
    trace,
    log,
  });

  log(`[agent-eval] running ${issue.id}: ${issue.title}`);
  const result = await agent.run(buildUserTask(toAgentTask(issue)));
  const verification = await runVerification({ repoRoot: options.repoRoot });
  const traceRecord = trace.toRecord(result);

  return {
    modifiedFiles: verification.modifiedFiles,
    diff: verification.diff,
    agentSummary: result.text,
    agentCompleted: result.completed,
    verification,
    trace: traceRecord,
    traceMarkdown: trace.formatReport(),
  };
}

export async function runAgentEval(
  options: RunAgentEvalOptions = {},
): Promise<AgentEvalRunResult> {
  const issues = loadEvalIssues({
    split: options.split ?? "all",
    ids: options.ids,
  });
  const judgeClient =
    options.skipJudge === true
      ? undefined
      : (options.judgeClient ?? createAnthropicJudgeClient());
  const artifactsDir = options.artifactsDir
    ? resolve(options.artifactsDir)
    : undefined;
  const results: AgentIssueEvalResult[] = [];
  const artifactsByIssue = new Map<string, AgentRunArtifacts>();

  for (const issue of issues) {
    let artifacts: AgentRunArtifacts;

    if (artifactsDir) {
      artifacts = await loadArtifactsFromDir(artifactsDir, issue.id);
    } else if (options.skipRun) {
      const verification = await runVerification({ repoRoot: options.repoRoot });
      artifacts = {
        modifiedFiles: verification.modifiedFiles,
        diff: verification.diff,
        agentSummary: toEvalQuery(issue),
        agentCompleted: true,
        verification,
      };
    } else if (options.runIssue) {
      artifacts = await options.runIssue(issue);
    } else {
      artifacts = await runAgentForEvalIssue(issue, options);
    }

    artifactsByIssue.set(issue.id, artifacts);

    const scored = await scoreAgentIssue({
      issue,
      artifacts,
      judgeClient,
      skipJudge: options.skipJudge,
      repoRoot: options.repoRoot,
    });
    results.push(scored);
  }

  return {
    summary: summarizeAgentEval(results),
    artifactsByIssue,
  };
}
