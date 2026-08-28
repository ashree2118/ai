import assert from "node:assert/strict";
import test from "node:test";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  ContextBuilder,
  buildContextPrompt,
  formatGithubIssue,
  formatRagResults,
  formatToolHistory,
} from "./builder.js";

test("buildContextPrompt renders all required sections", () => {
  const prompt = buildContextPrompt({
    systemInstructions: "Be concise.",
    githubIssue: "#12 Fix parser",
    repositoryStructure: "src/\n  agent.ts",
    ragResults: "1. src/agent.ts",
    episodicMemory: "1. [bug_fix] similarity=0.80",
    toolHistory: "(none yet)",
  });

  assert.match(prompt, /## System Instructions/);
  assert.match(prompt, /## GitHub Issue/);
  assert.match(prompt, /## Repository Structure/);
  assert.match(prompt, /## Retrieved Code Context/);
  assert.match(prompt, /## Similar Past Episodes/);
  assert.match(prompt, /## Tool History/);
  assert.match(prompt, /Fix parser/);
});

test("formatToolHistory summarizes tool_use and tool_result pairs", () => {
  const messages: MessageParam[] = [
    { role: "user", content: "start" },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "read_file",
          input: { path: "package.json" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: '{"name":"token-lab"}',
        },
      ],
    },
  ];

  const history = formatToolHistory(messages);
  assert.match(history, /read_file/);
  assert.match(history, /ok:/);
  assert.match(history, /token-lab/);
});

test("ContextBuilder refreshes tool history from message state", () => {
  const builder = new ContextBuilder({
    systemInstructions: "instructions",
    githubIssue: "issue",
    repositoryStructure: "src/",
    ragResults: "(none)",
    episodicMemory: "(no similar past episodes)",
  });

  const before = builder.buildSystem([]);
  assert.match(before, /\(none yet\)/);

  const after = builder.buildSystem([
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "list_files",
          input: { path: "src" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: "[file] agent.ts",
        },
      ],
    },
  ]);

  assert.match(after, /list_files/);
  assert.doesNotMatch(after, /\(none yet\)/);
});

test("formatRagResults stays concise", () => {
  const formatted = formatRagResults([
    {
      id: "1",
      filePath: "src/a.ts",
      symbol: "foo",
      kind: "function",
      startLine: 1,
      endLine: 3,
      code: "line1\nline2\nline3",
      similarity: 0.8123,
    },
  ]);

  assert.match(formatted, /similarity=0\.812/);
  assert.match(formatted, /```/);
});

test("formatGithubIssue includes number and body", () => {
  const text = formatGithubIssue({
    number: 7,
    title: "Bug",
    body: "Reproduce steps",
  });
  assert.match(text, /#7 Bug/);
  assert.match(text, /Reproduce steps/);
});
