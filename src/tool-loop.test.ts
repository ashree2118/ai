import assert from "node:assert/strict";
import test from "node:test";
import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages/messages";
import { HitlGate } from "./hitl/gate.js";
import { executeTools, groupToolUsesByDependency } from "./tool-loop.js";
import { setVerificationRunner, resetVerificationRunner } from "./tool-registry.js";

function toolUse(
  id: string,
  name: string,
  input: Record<string, unknown>,
): ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

test("groupToolUsesByDependency runs independent tools in one group", () => {
  const toolUses = [
    toolUse("toolu_1", "read_file", { path: "a.ts" }),
    toolUse("toolu_2", "read_file", { path: "b.ts" }),
    toolUse("toolu_3", "list_files", { path: "src" }),
  ];

  assert.deepEqual(
    groupToolUsesByDependency(toolUses).map((group) =>
      group.map((item) => item.id),
    ),
    [["toolu_1", "toolu_2", "toolu_3"]],
  );
});

test("groupToolUsesByDependency keeps dependent tools sequential", () => {
  const toolUses = [
    toolUse("toolu_a", "read_file", { path: "package.json" }),
    toolUse("toolu_b", "run_command", {
      command: "echo toolu_a",
      note: "depends on toolu_a",
    }),
    toolUse("toolu_c", "list_files", { path: "src" }),
  ];

  assert.deepEqual(
    groupToolUsesByDependency(toolUses).map((group) =>
      group.map((item) => item.id),
    ),
    [["toolu_a", "toolu_c"], ["toolu_b"]],
  );
});

test("executeTools preserves results for mixed success and failure", async () => {
  const toolUses = [
    toolUse("toolu_ok", "list_files", { path: "src" }),
    toolUse("toolu_bad", "read_file", { path: "src", encoding: "ascii" }),
    toolUse("toolu_ok2", "read_file", { path: "package.json" }),
  ];

  const results = await executeTools(toolUses);

  assert.equal(results.length, 3);
  assert.equal(results[0]?.tool_use_id, "toolu_ok");
  assert.equal(results[0]?.is_error, undefined);
  assert.equal(results[1]?.tool_use_id, "toolu_bad");
  assert.equal(results[1]?.is_error, true);
  assert.match(String(results[1]?.content), /encoding must be one of: utf8/);
  assert.equal(results[2]?.tool_use_id, "toolu_ok2");
  assert.match(String(results[2]?.content), /token-lab/);
});

test("executeTools runs independent reads concurrently", async () => {
  const toolUses = [
    toolUse("toolu_1", "read_file", { path: "package.json" }),
    toolUse("toolu_2", "read_file", { path: "tsconfig.json" }),
  ];

  const results = await executeTools(toolUses);
  assert.equal(results.length, 2);
  assert.equal(results.every((result) => !result.is_error), true);
});

test("executeTools blocks github_create_pr when HITL rejects PR checkpoint", async () => {
  const previousSkip = process.env.SKIP_VERIFICATION;
  process.env.SKIP_VERIFICATION = "1";
  setVerificationRunner(async () => ({
    passed: true,
    modifiedFiles: [],
    diff: "",
    checks: [],
  }));

  const hitl = new HitlGate(async (request) =>
    request.kind === "pr_creation" ? "rejected" : "approved",
  );
  await hitl.ensurePlanApproved({
    assistantText: "Open PR",
    plan: ["Create PR"],
    pendingTools: ["github_create_pr"],
  });

  const toolUses = [
    toolUse("toolu_pr", "github_create_pr", {
      title: "Fix",
      head: "feature",
      base: "main",
    }),
  ];

  try {
    const results = await executeTools(toolUses, { hitl });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.is_error, true);
    assert.match(String(results[0]?.content), /rejected/i);
  } finally {
    resetVerificationRunner();
    if (previousSkip === undefined) delete process.env.SKIP_VERIFICATION;
    else process.env.SKIP_VERIFICATION = previousSkip;
  }
});
