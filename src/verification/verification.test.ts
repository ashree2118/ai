import assert from "node:assert/strict";
import test from "node:test";
import {
  isBlockedPath,
  mergeChangedPaths,
  parsePorcelainPaths,
  verifyGitDiff,
} from "./git.js";
import {
  formatVerificationFailure,
  formatVerificationReport,
} from "./runner.js";

test("parsePorcelainPaths extracts file paths from git status", () => {
  const paths = parsePorcelainPaths(
    " M src/tools.ts\n?? src/new.ts\nR  old.ts -> new-name.ts",
  );
  assert.deepEqual(paths, ["src/tools.ts", "src/new.ts", "new-name.ts"]);
});

test("mergeChangedPaths deduplicates and sorts paths", () => {
  assert.deepEqual(
    mergeChangedPaths(["b.ts", "a.ts"], ["a.ts", "c.ts"]),
    ["a.ts", "b.ts", "c.ts"],
  );
});

test("isBlockedPath rejects sensitive filenames", () => {
  assert.equal(isBlockedPath(".env"), true);
  assert.equal(isBlockedPath("src/tools.ts"), false);
});

test("verifyGitDiff accepts empty and non-empty diffs", () => {
  assert.equal(verifyGitDiff("").passed, true);
  assert.equal(verifyGitDiff("diff --git a/a.ts b/a.ts").passed, true);
});

test("formatVerificationReport includes checks and diff", () => {
  const report = formatVerificationReport({
    passed: false,
    modifiedFiles: ["src/a.ts"],
    diff: "diff --git a/src/a.ts",
    checks: [
      { name: "typecheck", passed: false, details: "tsc failed" },
      { name: "tests", passed: true, details: "ok" },
    ],
  });

  assert.match(report, /Verification failed/);
  assert.match(report, /src\/a\.ts/);
  assert.match(report, /FAIL typecheck/);
  assert.match(report, /PASS tests/);
});

test("formatVerificationFailure summarizes failed checks", () => {
  const message = formatVerificationFailure({
    passed: false,
    modifiedFiles: ["src/a.ts"],
    diff: "",
    checks: [{ name: "tests", passed: false, details: "2 failing" }],
  });

  assert.match(message, /PR creation blocked/);
  assert.match(message, /tests: 2 failing/);
});
