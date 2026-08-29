import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { GITHUB_TOOLS } from "../github/toolkit.js";

export const GITHUB_MCP_TOOL_NAMES = [
  "get_issue",
  "list_files",
  "read_file",
  "write_file",
  "create_branch",
  "create_pr",
] as const;

export type GithubMcpToolName = (typeof GITHUB_MCP_TOOL_NAMES)[number];

export type McpToolDefinition = {
  name: GithubMcpToolName;
  description: string;
  inputSchema: Tool["input_schema"];
};

export function toMcpGithubToolName(agentToolName: string): GithubMcpToolName {
  if (!agentToolName.startsWith("github_")) {
    throw new Error(`not a github agent tool: ${agentToolName}`);
  }
  const mcpName = agentToolName.slice("github_".length);
  if (!(GITHUB_MCP_TOOL_NAMES as readonly string[]).includes(mcpName)) {
    throw new Error(`unknown github agent tool: ${agentToolName}`);
  }
  return mcpName as GithubMcpToolName;
}

export function toAgentGithubToolName(mcpToolName: string): string {
  return `github_${mcpToolName}`;
}

export function buildMcpToolDefinitions(): McpToolDefinition[] {
  return GITHUB_TOOLS.map((tool) => ({
    name: toMcpGithubToolName(tool.name),
    description: tool.description ?? "",
    inputSchema: tool.input_schema,
  }));
}
