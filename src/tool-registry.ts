import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { GITHUB_TOOLS, runGithubTool } from "./github/toolkit.js";
import { TOOLS as WORKSPACE_TOOLS, runWorkspaceTool } from "./tools.js";

export const TOOLS: Tool[] = [...WORKSPACE_TOOLS, ...GITHUB_TOOLS];

export async function runTool(name: string, input: unknown): Promise<string> {
  if (name.startsWith("github_")) {
    return runGithubTool(name, input);
  }
  return runWorkspaceTool(name, input);
}
