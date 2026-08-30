import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTraceRecord } from "../trace/agent-trace.js";
import type { AgentRunArtifacts } from "./agent-runner.js";
import type {
  AgentIssueEvalResult,
  IssueEvalResult,
} from "./metrics.js";

export const FAILURE_CATEGORIES = [
  "retrieval",
  "planning",
  "tool",
  "edit",
  "test",
  "context",
  "memory",
  "termination",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export type EvalFailureRecord = {
  issueId: string;
  title: string;
  evalType: "retrieval" | "agent";
  category: FailureCategory;
  secondaryCategories: FailureCategory[];
  summary: string;
  trace: AgentTraceRecord | null;
  traceMarkdown: string;
  diff: string;
  testOutput: string;
};

export type FailureAnalysisReport = {
  totalFailures: number;
  byCategory: Record<FailureCategory, number>;
  mostCommonCategory: FailureCategory | null;
  records: EvalFailureRecord[];
};

export function emptyCategoryCounts(): Record<FailureCategory, number> {
  return {
    retrieval: 0,
    planning: 0,
    tool: 0,
    edit: 0,
    test: 0,
    context: 0,
    memory: 0,
    termination: 0,
  };
}

function testOutputFromArtifacts(artifacts: AgentRunArtifacts): string {
  const tests = artifacts.verification?.checks.find(
    (check) => check.name === "tests",
  );
  return tests?.details ?? "";
}

function traceMarkdownFromArtifacts(artifacts: AgentRunArtifacts): string {
  if (artifacts.traceMarkdown) {
    return artifacts.traceMarkdown;
  }
  if (!artifacts.trace) {
    return "";
  }
  return formatTraceMarkdown(artifacts.trace);
}

export function formatTraceMarkdown(trace: AgentTraceRecord): string {
  const lines = [
    `# Trace: ${trace.issueId}`,
    `started: ${trace.startedAt}`,
    trace.finishedAt ? `finished: ${trace.finishedAt}` : "",
  ].filter(Boolean);

  for (const iteration of trace.iterations) {
    lines.push("", `## Iteration ${iteration.iteration}`);
    lines.push(`stop_reason: ${iteration.stopReason}`);
    if (iteration.assistantText) {
      lines.push("", iteration.assistantText);
    }
    for (const call of iteration.toolCalls) {
      lines.push("", `tool_call: ${call.name}`, JSON.stringify(call.input));
    }
    for (const result of iteration.toolResults) {
      lines.push(
        "",
        `tool_result: ${result.name} (${result.ok ? "ok" : "error"})`,
        result.output,
      );
    }
  }

  if (trace.outcome) {
    lines.push(
      "",
      "## Outcome",
      `completed: ${trace.outcome.completed}`,
      `stop_reason: ${trace.outcome.stopReason}`,
    );
    if (trace.outcome.partialReason) {
      lines.push(`partial_reason: ${trace.outcome.partialReason}`);
    }
    if (trace.outcome.finalText) {
      lines.push("", trace.outcome.finalText);
    }
  }

  return lines.join("\n");
}

function toolErrors(trace: AgentTraceRecord | undefined): TraceToolResult[] {
  if (!trace) return [];
  return trace.iterations.flatMap((iteration) =>
    iteration.toolResults.filter((result) => !result.ok),
  );
}

type TraceToolResult = AgentTraceRecord["iterations"][number]["toolResults"][number];

function hasContextPressure(trace: AgentTraceRecord | undefined): boolean {
  const partial = trace?.outcome?.partialReason ?? "";
  return /token|budget|context|compress|truncat/i.test(partial);
}

function hasMemoryIssue(trace: AgentTraceRecord | undefined): boolean {
  if (!trace) return false;

  const readPaths = trace.iterations
    .flatMap((iteration) => iteration.toolCalls)
    .filter((call) => call.name === "read_file" || call.name === "github_read_file")
    .map((call) => JSON.stringify((call.input as { path?: string }).path ?? ""));

  const duplicateReads = readPaths.some(
    (path, index) => readPaths.indexOf(path) !== index,
  );

  const writeCalls = trace.iterations
    .flatMap((iteration) => iteration.toolCalls)
    .filter((call) =>
      ["github_write_file", "run_command"].includes(call.name),
    );

  return duplicateReads && writeCalls.length === 0 && trace.iterations.length >= 3;
}

function collectSecondaryCategories(input: {
  result: AgentIssueEvalResult;
  artifacts: AgentRunArtifacts;
  trace?: AgentTraceRecord;
  primary: FailureCategory;
}): FailureCategory[] {
  const secondary = new Set<FailureCategory>();
  const { result, artifacts, trace, primary } = input;

  if (primary !== "termination" && !artifacts.agentCompleted) {
    secondary.add("termination");
  }
  if (primary !== "tool" && toolErrors(trace).length > 0) {
    secondary.add("tool");
  }
  if (primary !== "test" && !result.testsPassed) {
    secondary.add("test");
  }
  if (
    primary !== "edit" &&
    (result.fileRecall < 1 || result.filePrecision < 1)
  ) {
    secondary.add("edit");
  }
  if (primary !== "planning" && !result.prAccepted) {
    secondary.add("planning");
  }
  if (primary !== "context" && hasContextPressure(trace)) {
    secondary.add("context");
  }
  if (primary !== "memory" && hasMemoryIssue(trace)) {
    secondary.add("memory");
  }

  return [...secondary];
}

export function classifyAgentFailure(input: {
  result: AgentIssueEvalResult;
  artifacts: AgentRunArtifacts;
}): { category: FailureCategory; summary: string } {
  const { result, artifacts } = input;
  const trace = artifacts.trace;

  if (!artifacts.agentCompleted) {
    if (hasContextPressure(trace)) {
      return {
        category: "context",
        summary:
          trace?.outcome?.partialReason ??
          "Agent stopped before completing due to context or token limits.",
      };
    }
    return {
      category: "termination",
      summary:
        trace?.outcome?.partialReason ??
        `Agent did not complete (stop_reason=${trace?.outcome?.stopReason ?? "unknown"}).`,
    };
  }

  const errors = toolErrors(trace);
  if (errors.length > 0) {
    return {
      category: "tool",
      summary: `Tool errors: ${errors
        .map((error) => `${error.name} (${error.output.slice(0, 80)})`)
        .join("; ")}`,
    };
  }

  if (!result.testsPassed) {
    const output = testOutputFromArtifacts(artifacts);
    return {
      category: "test",
      summary: output
        ? `Tests failed: ${output.slice(0, 200)}`
        : "Verification test check failed.",
    };
  }

  if (result.fileRecall < 1 || result.filePrecision < 1) {
    const missing = result.correctFiles.filter(
      (file) => !result.modifiedFiles.includes(file),
    );
    const extra = result.modifiedFiles.filter(
      (file) => !result.correctFiles.includes(file),
    );
    const parts = [];
    if (missing.length > 0) parts.push(`missing ${missing.join(", ")}`);
    if (extra.length > 0) parts.push(`extra ${extra.join(", ")}`);
    return {
      category: "edit",
      summary: `Wrong files edited (${parts.join("; ") || "file mismatch"}).`,
    };
  }

  if (!result.prAccepted) {
    return {
      category: "planning",
      summary:
        result.judgeRationale || "PR rejected by judge for incomplete approach.",
    };
  }

  if (hasContextPressure(trace)) {
    return {
      category: "context",
      summary:
        trace?.outcome?.partialReason ??
        "Context management affected the run.",
    };
  }

  if (hasMemoryIssue(trace)) {
    return {
      category: "memory",
      summary: "Repeated reads without progress suggest memory/scratchpad issues.",
    };
  }

  return {
    category: "planning",
    summary: "Agent run failed overall checks without a more specific signal.",
  };
}

export function buildRetrievalFailureRecord(
  result: IssueEvalResult,
): EvalFailureRecord {
  const missing = result.relevantFiles.filter(
    (file) => !result.retrievedFiles.slice(0, 10).includes(file),
  );

  return {
    issueId: result.issueId,
    title: result.title,
    evalType: "retrieval",
    category: "retrieval",
    secondaryCategories: [],
    summary: `Relevant files not retrieved in top-10: ${missing.join(", ") || "(none found)"}`,
    trace: null,
    traceMarkdown: [
      `# Retrieval failure: ${result.issueId}`,
      `query: ${result.query}`,
      `relevant: ${result.relevantFiles.join(", ")}`,
      `retrieved: ${result.retrievedFiles.join(", ") || "(none)"}`,
    ].join("\n"),
    diff: "",
    testOutput: "",
  };
}

export function buildAgentFailureRecord(input: {
  result: AgentIssueEvalResult;
  artifacts: AgentRunArtifacts;
}): EvalFailureRecord {
  const { category, summary } = classifyAgentFailure(input);

  return {
    issueId: input.result.issueId,
    title: input.result.title,
    evalType: "agent",
    category,
    secondaryCategories: collectSecondaryCategories({
      ...input,
      primary: category,
    }),
    summary,
    trace: input.artifacts.trace ?? null,
    traceMarkdown: traceMarkdownFromArtifacts(input.artifacts),
    diff: input.artifacts.diff,
    testOutput: testOutputFromArtifacts(input.artifacts),
  };
}

export function summarizeFailureCategories(
  records: EvalFailureRecord[],
): Pick<FailureAnalysisReport, "byCategory" | "mostCommonCategory"> {
  const byCategory = emptyCategoryCounts();
  for (const record of records) {
    byCategory[record.category] += 1;
  }

  let mostCommonCategory: FailureCategory | null = null;
  let topCount = 0;
  for (const category of FAILURE_CATEGORIES) {
    if (byCategory[category] > topCount) {
      topCount = byCategory[category];
      mostCommonCategory = category;
    }
  }

  return { byCategory, mostCommonCategory };
}

export function analyzeEvalFailures(input: {
  retrievalFailures?: IssueEvalResult[];
  agentFailures?: AgentIssueEvalResult[];
  artifactsByIssue?: Map<string, AgentRunArtifacts>;
}): FailureAnalysisReport {
  const records: EvalFailureRecord[] = [];

  for (const failure of input.retrievalFailures ?? []) {
    records.push(buildRetrievalFailureRecord(failure));
  }

  const artifactsByIssue = input.artifactsByIssue ?? new Map();
  for (const failure of input.agentFailures ?? []) {
    const artifacts = artifactsByIssue.get(failure.issueId) ?? {
      modifiedFiles: failure.modifiedFiles,
      diff: "",
      agentSummary: failure.judgeRationale,
      agentCompleted: failure.agentCompleted,
    };
    records.push(buildAgentFailureRecord({ result: failure, artifacts }));
  }

  const { byCategory, mostCommonCategory } = summarizeFailureCategories(records);

  return {
    totalFailures: records.length,
    byCategory,
    mostCommonCategory,
    records,
  };
}

function bar(count: number, max: number, width = 20): string {
  if (max === 0 || count === 0) return "".padEnd(width, " ");
  const filled = Math.max(1, Math.round((count / max) * width));
  return "#".repeat(filled).padEnd(width, " ");
}

export function formatFailureReport(report: FailureAnalysisReport): string {
  if (report.totalFailures === 0) {
    return "FAILURE ANALYSIS\nNo failures to analyze.";
  }

  const maxCount = Math.max(...Object.values(report.byCategory));
  const lines = [
    "FAILURE ANALYSIS",
    "================",
    "",
    `Total failures: ${report.totalFailures}`,
    `Most common:    ${report.mostCommonCategory ?? "n/a"}`,
    "",
    "By category:",
  ];

  for (const category of FAILURE_CATEGORIES) {
    const count = report.byCategory[category];
    if (count === 0) continue;
    lines.push(
      `  ${category.padEnd(12)} ${String(count).padStart(2)}  ${bar(count, maxCount)}`,
    );
  }

  lines.push("", "Details:");
  for (const record of report.records) {
    lines.push(
      `- ${record.issueId} [${record.evalType}/${record.category}] ${record.title}`,
      `  ${record.summary}`,
    );
    if (record.secondaryCategories.length > 0) {
      lines.push(`  also: ${record.secondaryCategories.join(", ")}`);
    }
    if (record.diff.trim()) {
      lines.push(`  diff: ${record.diff.trim().split("\n")[0]}…`);
    }
    if (record.testOutput.trim()) {
      lines.push(`  tests: ${record.testOutput.trim().slice(0, 120)}…`);
    }
    if (record.traceMarkdown.trim()) {
      const firstLine = record.traceMarkdown.trim().split("\n")[0];
      lines.push(`  trace: ${firstLine}`);
    }
  }

  return lines.join("\n");
}

export async function saveFailureRecords(
  resultsDir: string,
  runId: string,
  report: FailureAnalysisReport,
): Promise<string | null> {
  if (report.totalFailures === 0) {
    return null;
  }

  const dir = join(resultsDir, "failures", runId);
  await mkdir(dir, { recursive: true });

  for (const record of report.records) {
    await writeFile(
      join(dir, `${record.issueId}.json`),
      JSON.stringify(record, null, 2),
      "utf8",
    );
  }

  return dir;
}
