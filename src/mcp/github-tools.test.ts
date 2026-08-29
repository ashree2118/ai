import assert from "node:assert/strict";
import test from "node:test";
import { GITHUB_TOOLS } from "../github/toolkit.js";
import {
  buildMcpToolDefinitions,
  toAgentGithubToolName,
  toMcpGithubToolName,
} from "./github-tools.js";

test("buildMcpToolDefinitions exposes six github tools without prefix", () => {
  const tools = buildMcpToolDefinitions();
  assert.equal(tools.length, 6);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "get_issue",
      "list_files",
      "read_file",
      "create_branch",
      "write_file",
      "create_pr",
    ],
  );
});

test("github tool name mapping round-trips", () => {
  assert.equal(toMcpGithubToolName("github_read_file"), "read_file");
  assert.equal(toAgentGithubToolName("read_file"), "github_read_file");
});

test("mcp tool schemas match existing github tool schemas", () => {
  const mcpByName = new Map(
    buildMcpToolDefinitions().map((tool) => [tool.name, tool.inputSchema]),
  );

  for (const tool of GITHUB_TOOLS) {
    const mcpName = toMcpGithubToolName(tool.name);
    assert.deepEqual(mcpByName.get(mcpName), tool.input_schema);
  }
});
