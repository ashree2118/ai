import assert from "node:assert/strict";
import test from "node:test";
import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  RetryPolicy,
  mergeToolResults,
  partitionToolUses,
  toolSignature,
} from "./retry.js";

function toolUse(
  id: string,
  name: string,
  input: Record<string, unknown>,
): ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

test("toolSignature is stable for identical tool inputs", () => {
  const one = toolSignature("read_file", { path: "src/a.ts" });
  const two = toolSignature("read_file", { path: "src/a.ts" });
  assert.equal(one, two);
  assert.notEqual(one, toolSignature("read_file", { path: "src/b.ts" }));
});

test("RetryPolicy blocks repeated failing tool calls after retry limit", () => {
  const policy = new RetryPolicy(2);
  const uses = [toolUse("toolu_1", "read_file", { path: "missing.ts" })];

  assert.equal(policy.check(uses[0]!).allowed, true);

  policy.recordBatch(uses, [
    {
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: "ENOENT",
      is_error: true,
    },
  ]);

  assert.equal(policy.check(uses[0]!).allowed, true);

  policy.recordBatch(uses, [
    {
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: "ENOENT again",
      is_error: true,
    },
  ]);

  const blocked = policy.check(uses[0]!);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message ?? "", /Retry blocked/);
});

test("partitionToolUses separates blocked and allowed tool calls", () => {
  const policy = new RetryPolicy(1);
  const uses = [toolUse("toolu_1", "run_command", { command: "npm test" })];

  policy.recordBatch(uses, [
    {
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: "tests failed",
      is_error: true,
    },
  ]);

  const { allowed, blocked } = partitionToolUses(uses, policy);
  assert.equal(allowed.length, 0);
  assert.equal(blocked.length, 1);
  assert.match(String(blocked[0]?.content), /Retry blocked/);
});

test("mergeToolResults preserves original tool order", () => {
  const uses = [
    toolUse("toolu_a", "list_files", { path: "src" }),
    toolUse("toolu_b", "read_file", { path: "package.json" }),
  ];

  const merged = mergeToolResults(
    uses,
    [
      {
        type: "tool_result",
        tool_use_id: "toolu_b",
        content: "{}",
      },
    ],
    [
      {
        type: "tool_result",
        tool_use_id: "toolu_a",
        content: "blocked",
        is_error: true,
      },
    ],
  );

  assert.deepEqual(
    merged.map((result) => result.tool_use_id),
    ["toolu_a", "toolu_b"],
  );
});

test("RetryPolicy formats reflection section from recent failures", () => {
  const policy = new RetryPolicy(3);
  policy.recordBatch([toolUse("toolu_1", "run_command", { command: "npm test" })], [
    {
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: "2 failing tests",
      is_error: true,
    },
  ]);

  const section = policy.formatReflectionSection();
  assert.match(section, /## Reflection/);
  assert.match(section, /run_command/);
  assert.match(section, /2 failing tests/);
});
