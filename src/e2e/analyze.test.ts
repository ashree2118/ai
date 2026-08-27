import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTrace } from "./analyze.js";
import { E2E_REAL_ISSUE } from "./real-issue.js";
import type { AgentTraceRecord } from "../trace/agent-trace.js";

const SAMPLE_RECORD: AgentTraceRecord = {
  issueId: "e2e-issue-02",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:01:00.000Z",
  iterations: [
    {
      iteration: 1,
      assistantText: "I will inspect src/tools.ts and src/validation.ts",
      stopReason: "tool_use",
      usage: { inputTokens: 100, outputTokens: 20 },
      cumulativeTokens: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      toolCalls: [
        {
          iteration: 1,
          toolUseId: "toolu_1",
          name: "read_file",
          input: { path: "src/tools.ts" },
        },
      ],
      toolResults: [
        {
          iteration: 1,
          toolUseId: "toolu_1",
          name: "read_file",
          ok: true,
          output: "export const TOOLS = [];",
        },
      ],
    },
    {
      iteration: 2,
      assistantText: "Strict schemas live in src/tools.ts and src/validation.ts",
      stopReason: "end_turn",
      usage: { inputTokens: 200, outputTokens: 40 },
      cumulativeTokens: { inputTokens: 300, outputTokens: 60, totalTokens: 360 },
      toolCalls: [],
      toolResults: [],
    },
  ],
  outcome: {
    completed: true,
    stopReason: "end_turn",
    finalText: "Strict schemas live in src/tools.ts and src/validation.ts",
    tokenUsage: { inputTokens: 300, outputTokens: 60, totalTokens: 360 },
  },
};

test("analyzeTrace notes successes and file references", () => {
  const analysis = analyzeTrace(E2E_REAL_ISSUE, SAMPLE_RECORD);
  assert.match(analysis, /Succeeds/);
  assert.match(analysis, /src\/tools\.ts/);
  assert.match(analysis, /Completed: true/);
});

test("analyzeTrace flags unnecessary github tool usage", () => {
  const record: AgentTraceRecord = {
    ...SAMPLE_RECORD,
    iterations: [
      {
        ...SAMPLE_RECORD.iterations[0]!,
        toolCalls: [
          {
            iteration: 1,
            toolUseId: "toolu_2",
            name: "github_read_file",
            input: { path: "src/tools.ts" },
          },
        ],
        toolResults: [
          {
            iteration: 1,
            toolUseId: "toolu_2",
            name: "github_read_file",
            ok: true,
            output: "ok",
          },
        ],
      },
    ],
  };

  const analysis = analyzeTrace(E2E_REAL_ISSUE, record);
  assert.match(analysis, /Unnecessary or questionable/);
  assert.match(analysis, /GitHub tools used/);
});
