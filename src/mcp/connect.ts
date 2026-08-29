import { resetGithubToolRunner, setGithubToolRunner } from "../tool-registry.js";
import { GithubMcpClient } from "./github-client.js";

let client: GithubMcpClient | null = null;

export function shouldUseGithubMcp(): boolean {
  const value = process.env.USE_GITHUB_MCP?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export async function connectGithubMcp(): Promise<void> {
  if (client) return;

  client = await GithubMcpClient.connect();
  setGithubToolRunner((name, input) => client!.runGithubTool(name, input));
}

export async function disconnectGithubMcp(): Promise<void> {
  if (!client) return;
  await client.close();
  client = null;
  resetGithubToolRunner();
}

export async function ensureGithubMcp(enabled = shouldUseGithubMcp()): Promise<void> {
  if (!enabled) return;
  await connectGithubMcp();
}
