import assert from "node:assert/strict";
import test from "node:test";
import {
  ToolInputError,
  runTool,
  validateListFilesInput,
  validateReadFileInput,
  validateRunCommandInput,
  validateToolInput,
} from "./tools.js";

test("validateListFilesInput accepts valid input", () => {
  assert.deepEqual(validateListFilesInput({ path: "src" }), { path: "src" });
  assert.deepEqual(
    validateListFilesInput({
      path: ".",
      include_hidden: true,
      sort: "type",
    }),
    { path: ".", include_hidden: true, sort: "type" },
  );
});

test("validateListFilesInput rejects invalid input", () => {
  assert.throws(
    () => validateListFilesInput({}),
    (err: Error) => err.message === "path must be a string",
  );
  assert.throws(
    () => validateListFilesInput({ path: "" }),
    (err: Error) => err.message === "path must be at least 1 character(s)",
  );
  assert.throws(
    () => validateListFilesInput({ path: "src", sort: "size" }),
    (err: Error) => err.message === "sort must be one of: name, type",
  );
  assert.throws(
    () => validateListFilesInput({ path: "src", extra: true }),
    (err: Error) => err.message === "unexpected field: extra",
  );
  assert.throws(
    () => validateListFilesInput("src"),
    (err: Error) => err.message === "input must be an object",
  );
});

test("validateReadFileInput accepts valid input", () => {
  assert.deepEqual(validateReadFileInput({ path: "package.json" }), {
    path: "package.json",
  });
  assert.deepEqual(
    validateReadFileInput({
      path: "package.json",
      encoding: "utf8",
      max_bytes: 4096,
    }),
    { path: "package.json", encoding: "utf8", max_bytes: 4096 },
  );
});

test("validateReadFileInput rejects invalid input", () => {
  assert.throws(
    () => validateReadFileInput({ path: 1 }),
    (err: Error) => err.message === "path must be a string",
  );
  assert.throws(
    () => validateReadFileInput({ path: "x", encoding: "latin1" }),
    (err: Error) => err.message === "encoding must be one of: utf8",
  );
  assert.throws(
    () => validateReadFileInput({ path: "x", max_bytes: 0 }),
    (err: Error) => err.message === "max_bytes must be between 1 and 1048576",
  );
  assert.throws(
    () => validateReadFileInput({ path: "x", max_bytes: 2_000_000 }),
    (err: Error) => err.message === "max_bytes must be between 1 and 1048576",
  );
});

test("validateRunCommandInput accepts valid input", () => {
  assert.deepEqual(validateRunCommandInput({ command: "echo hi" }), {
    command: "echo hi",
  });
  assert.deepEqual(
    validateRunCommandInput({
      command: "Get-ChildItem",
      shell: "powershell",
      timeout_ms: 5000,
    }),
    { command: "Get-ChildItem", shell: "powershell", timeout_ms: 5000 },
  );
});

test("validateRunCommandInput rejects invalid input", () => {
  assert.throws(
    () => validateRunCommandInput({ command: "" }),
    (err: Error) => err.message === "command must be at least 1 character(s)",
  );
  assert.throws(
    () => validateRunCommandInput({ command: "ls", shell: "cmd" }),
    (err: Error) => err.message === "shell must be one of: posix, powershell",
  );
  assert.throws(
    () => validateRunCommandInput({ command: "ls", timeout_ms: 500 }),
    (err: Error) => err.message === "timeout_ms must be between 1000 and 60000",
  );
});

test("validateToolInput dispatches by tool name", () => {
  assert.doesNotThrow(() =>
    validateToolInput("list_files", { path: "src" }),
  );
  assert.throws(
    () => validateToolInput("missing_tool", { path: "src" }),
    (err: Error) => err.message === "unknown workspace tool: missing_tool",
  );
});

test("runTool executes valid list_files and read_file", async () => {
  const listing = await runTool("list_files", { path: "src", sort: "name" });
  assert.match(listing, /agent\.ts/);

  const contents = await runTool("read_file", {
    path: "package.json",
    max_bytes: 4096,
  });
  assert.match(contents, /"name": "token-lab"/);
});

test("runTool rejects invalid input before execution", async () => {
  await assert.rejects(
    () => runTool("read_file", { path: "package.json", encoding: "ascii" }),
    (err: unknown) =>
      err instanceof ToolInputError &&
      err.message === "encoding must be one of: utf8",
  );
});
