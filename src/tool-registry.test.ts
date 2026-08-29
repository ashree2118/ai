import assert from "node:assert/strict";
import test from "node:test";
import {
  resetVerificationRunner,
  runTool,
  setVerificationRunner,
  TOOLS,
} from "./tool-registry.js";

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

test("github_create_pr is blocked when verification fails", async () => {
  const previousSkip = process.env.SKIP_VERIFICATION;
  process.env.SKIP_VERIFICATION = "0";
  setVerificationRunner(async () => ({
    passed: false,
    modifiedFiles: ["src/broken.ts"],
    diff: "diff",
    checks: [{ name: "tests", passed: false, details: "failed" }],
  }));

  try {
    await assert.rejects(
      () =>
        runTool("github_create_pr", {
          title: "Test",
          head: "feature",
          base: "main",
        }),
      /Verification failed/,
    );
  } finally {
    resetVerificationRunner();
    if (previousSkip === undefined) delete process.env.SKIP_VERIFICATION;
    else process.env.SKIP_VERIFICATION = previousSkip;
  }
});
