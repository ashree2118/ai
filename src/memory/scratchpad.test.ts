import assert from "node:assert/strict";
import test from "node:test";
import { ScratchpadMemory } from "./scratchpad.js";

test("ScratchpadMemory initializes goal and default plan", () => {
  const scratchpad = new ScratchpadMemory();
  scratchpad.setGoal("Explain tool validation");

  const state = scratchpad.snapshot;
  assert.equal(state.goal, "Explain tool validation");
  assert.ok(state.plan.length >= 2);
  assert.match(scratchpad.format(), /## Scratchpad/);
  assert.match(scratchpad.format(), /### Goal/);
});

test("ScratchpadMemory records inspected files and discoveries from read_file", () => {
  const scratchpad = new ScratchpadMemory();
  scratchpad.setGoal("Inspect tools");

  scratchpad.recordToolBatch(
    [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "read_file",
        input: { path: "src/tools.ts" },
      },
    ],
    [
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        content: 'export const TOOLS = ["list_files"];',
      },
    ],
  );

  const state = scratchpad.snapshot;
  assert.deepEqual(state.inspectedFiles, ["src/tools.ts"]);
  assert.ok(state.discoveries.some((item) => item.includes("src/tools.ts")));
  assert.match(state.nextAction, /Synthesize/);
});

test("ScratchpadMemory records test results from run_command", () => {
  const scratchpad = new ScratchpadMemory();
  scratchpad.setGoal("Run tests");

  scratchpad.recordToolBatch(
    [
      {
        type: "tool_use",
        id: "toolu_2",
        name: "run_command",
        input: { command: "npm test" },
      },
    ],
    [
      {
        type: "tool_result",
        tool_use_id: "toolu_2",
        content: "43 passing",
      },
    ],
  );

  const state = scratchpad.snapshot;
  assert.equal(state.testResults.length, 1);
  assert.match(state.testResults[0]!, /43 passing/);
  assert.match(state.nextAction, /test results/i);
});

test("ScratchpadMemory records changed files from github_write_file", () => {
  const scratchpad = new ScratchpadMemory();
  scratchpad.setGoal("Patch README");

  scratchpad.recordToolBatch(
    [
      {
        type: "tool_use",
        id: "toolu_3",
        name: "github_write_file",
        input: { path: "README.md", branch: "main", message: "docs", content: "# x" },
      },
    ],
    [
      {
        type: "tool_result",
        tool_use_id: "toolu_3",
        content: '{"path":"README.md"}',
      },
    ],
  );

  assert.deepEqual(scratchpad.snapshot.changedFiles, ["README.md"]);
  assert.match(scratchpad.snapshot.nextAction, /Verify changes/);
});
