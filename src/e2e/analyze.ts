import type { AgentTraceRecord } from "../trace/agent-trace.js";

export type E2ERealIssue = {
  id: string;
  title: string;
  issueBody: string;
  task: string;
  expectedFiles: string[];
};

export function analyzeTrace(
  issue: E2ERealIssue,
  record: AgentTraceRecord,
): string {
  const lines: string[] = [
    `# E2E Analysis: ${issue.id}`,
    "",
    `## Issue`,
    issue.title,
    "",
    issue.issueBody,
    "",
    "## Summary",
  ];

  const outcome = record.outcome;
  if (!outcome) {
    lines.push("- Run did not finish; no outcome recorded.");
    return lines.join("\n");
  }

  lines.push(
    `- Completed: ${outcome.completed}`,
    `- Stop reason: ${outcome.stopReason}`,
    `- Iterations: ${record.iterations.length}`,
    `- Total tokens: ${outcome.tokenUsage.totalTokens}`,
  );

  const toolCalls = record.iterations.flatMap((iteration) =>
    iteration.toolCalls.map((call) => ({
      ...call,
      iteration: iteration.iteration,
    })),
  );
  const toolNames = toolCalls.map((call) => call.name);
  const uniqueTools = [...new Set(toolNames)];

  lines.push("", "## Tool usage", `- Tools called: ${uniqueTools.join(", ") || "(none)"}`);

  const successes: string[] = [];
  const failures: string[] = [];
  const unnecessary: string[] = [];

  if (outcome.completed) {
    successes.push("Agent returned a final answer without hitting guardrails.");
  } else {
    failures.push(
      `Stopped early: ${outcome.partialReason ?? outcome.stopReason}`,
    );
  }

  const mentionedFiles = issue.expectedFiles.filter((file) =>
    outcome.finalText.includes(file),
  );
  if (mentionedFiles.length > 0) {
    successes.push(
      `Final response references expected files: ${mentionedFiles.join(", ")}`,
    );
  } else {
    failures.push(
      `Final response does not mention expected files: ${issue.expectedFiles.join(", ")}`,
    );
  }

  const githubTools = toolNames.filter((name) => name.startsWith("github_"));
  if (githubTools.length > 0) {
    unnecessary.push(
      `GitHub tools used (${githubTools.join(", ")}) even though issue context was already injected and files are local.`,
    );
  }

  const readPaths = toolCalls
    .filter((call) => call.name === "read_file" || call.name === "github_read_file")
    .map((call) => JSON.stringify((call.input as { path?: string }).path ?? ""));
  const duplicateReads = readPaths.filter(
    (path, index) => readPaths.indexOf(path) !== index,
  );
  if (duplicateReads.length > 0) {
    unnecessary.push(`Repeated file reads detected for: ${[...new Set(duplicateReads)].join(", ")}`);
  }

  const ragHits = record.iterations
    .flatMap((iteration) => iteration.assistantText.match(/src\/[\w./-]+/g) ?? [])
    .filter((path) => issue.expectedFiles.includes(path));
  if (ragHits.length > 0) {
    successes.push("Assistant discussion overlaps with RAG-relevant file paths.");
  }

  const toolErrors = record.iterations.flatMap((iteration) =>
    iteration.toolResults.filter((result) => !result.ok),
  );
  if (toolErrors.length > 0) {
    failures.push(
      `Tool errors: ${toolErrors.map((result) => `${result.name} (${result.output.slice(0, 80)})`).join("; ")}`,
    );
  }

  if (toolCalls.length === 0 && record.iterations.length <= 1) {
    unnecessary.push(
      "No tools were used; agent may have answered from injected context only without verifying files.",
    );
  }

  lines.push("", "## Succeeds", ...(successes.length ? successes.map((s) => `- ${s}`) : ["- (none noted)"]));
  lines.push("", "## Fails", ...(failures.length ? failures.map((f) => `- ${f}`) : ["- (none noted)"]));
  lines.push(
    "",
    "## Unnecessary or questionable",
    ...(unnecessary.length ? unnecessary.map((u) => `- ${u}`) : ["- (none noted)"]),
  );

  lines.push("", "## Iteration timeline");
  for (const iteration of record.iterations) {
    const tools = iteration.toolCalls.map((call) => call.name).join(", ") || "no tools";
    lines.push(
      `- Iteration ${iteration.iteration}: ${iteration.stopReason}; tools=[${tools}]`,
    );
  }

  return lines.join("\n");
}
