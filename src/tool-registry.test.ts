import assert from "node:assert/strict";
import test from "node:test";
import { runTool, TOOLS } from "./tool-registry.js";

test("tool registry includes workspace and github tools", () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.ok(names.includes("list_files"));
  assert.ok(names.includes("github_create_pr"));
  assert.equal(
    names.filter((name) => name.startsWith("github_")).length,
    6,
  );
});

test("tool registry dispatches github tools separately from workspace tools", async () => {
  await assert.rejects(
    () => runTool("github_read_file", { path: "README.md" }),
    /owner is required/,
  );
});
