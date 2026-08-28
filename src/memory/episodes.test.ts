import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEpisodeFromRun,
  episodeEmbeddingText,
  formatSimilarEpisodes,
  inferIssueType,
} from "./episodes.js";
import type { ReactAgentResult } from "../react-agent.js";

function sampleResult(overrides: Partial<ReactAgentResult> = {}): ReactAgentResult {
  return {
    text: "Validation lives in src/validation.ts.",
    iterations: 2,
    stopReason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 20 } as ReactAgentResult["usage"],
    tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    completed: true,
    messages: [],
    ...overrides,
  };
}

test("inferIssueType classifies common issue wording", () => {
  assert.equal(inferIssueType("Fix broken parser error"), "bug_fix");
  assert.equal(inferIssueType("Add support for streaming"), "feature");
  assert.equal(inferIssueType("Refactor tool registry"), "refactor");
  assert.equal(inferIssueType("Increase test coverage"), "test");
  assert.equal(inferIssueType("Update README docs"), "docs");
});

test("buildEpisodeFromRun maps scratchpad and result fields", () => {
  const episode = buildEpisodeFromRun({
    task: "Fix strict JSON schema validation",
    issueText: "Bug: invalid tool input should be rejected",
    result: sampleResult(),
    scratchpad: {
      goal: "Fix strict JSON schema validation",
      plan: ["Inspect src/validation.ts", "Run npm test"],
      hypothesis: "Validation is in src/validation.ts",
      inspectedFiles: ["src/validation.ts"],
      changedFiles: ["src/validation.ts"],
      discoveries: ["Read src/validation.ts: export function validate"],
      testResults: ["43 passing"],
      nextAction: "Provide final answer",
    },
  });

  assert.equal(episode.issueType, "bug_fix");
  assert.deepEqual(episode.filesChanged, ["src/validation.ts"]);
  assert.match(episode.approach, /validation\.ts/);
  assert.match(episode.whatWorked, /43 passing/);
  assert.equal(episode.whatFailed, "(none recorded)");
  assert.match(episode.result, /validation\.ts/);
});

test("buildEpisodeFromRun records partial failures", () => {
  const episode = buildEpisodeFromRun({
    task: "Investigate timeout",
    result: sampleResult({
      completed: false,
      partialReason: "Stopped at max_iterations",
    }),
    scratchpad: {
      goal: "Investigate timeout",
      plan: [],
      hypothesis: "",
      inspectedFiles: [],
      changedFiles: [],
      discoveries: ["read_file failed: ENOENT"],
      testResults: [],
      nextAction: "Inspect files",
    },
  });

  assert.match(episode.whatFailed, /ENOENT/);
  assert.match(episode.whatFailed, /max_iterations/);
});

test("episodeEmbeddingText includes searchable fields", () => {
  const text = episodeEmbeddingText({
    issueType: "bug_fix",
    issueText: "Fix parser",
    filesChanged: ["src/parser.ts"],
    approach: "Inspect parser",
    whatWorked: "Found root cause",
    whatFailed: "(none recorded)",
    result: "Updated parser",
    completed: true,
  });

  assert.match(text, /issue_type: bug_fix/);
  assert.match(text, /files_changed: src\/parser\.ts/);
  assert.match(text, /result: Updated parser/);
});

test("formatSimilarEpisodes renders concise reference context", () => {
  const formatted = formatSimilarEpisodes([
    {
      id: "ep-1",
      issueType: "bug_fix",
      issueText: "Fix parser crash",
      filesChanged: ["src/parser.ts"],
      approach: "Inspect parser and patch",
      whatWorked: "Found null guard",
      whatFailed: "(none recorded)",
      result: "Added guard",
      completed: true,
      similarity: 0.8421,
    },
  ]);

  assert.match(formatted, /similarity=0\.842/);
  assert.match(formatted, /Files changed: src\/parser\.ts/);
  assert.match(formatted, /Worked:/);
});
