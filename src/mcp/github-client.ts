import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { toMcpGithubToolName } from "./github-tools.js";

export type GithubMcpClientOptions = {
  command?: string;
  args?: string[];
  cwd?: string;
};

function extractMcpText(result: {
  content?: unknown;
  isError?: boolean;
}): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const text = blocks
    .map((block) => {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block
      ) {
        return String(block.text);
      }
      return JSON.stringify(block);
    })
    .join("\n");

  if (result.isError) {
    throw new Error(text || "MCP tool call failed");
  }

  return text;
}

function defaultServerArgs(): string[] {
  const fromEnv = process.env.GITHUB_MCP_SERVER_ARGS?.trim();
  if (fromEnv) return fromEnv.split(/\s+/);

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [resolve(moduleDir, "github-server.js")];
}

export class GithubMcpClient {
  private readonly client: Client;

  private constructor(client: Client) {
    this.client = client;
  }

  static async connect(
    options: GithubMcpClientOptions = {},
  ): Promise<GithubMcpClient> {
    const transport = new StdioClientTransport({
      command: options.command ?? process.env.GITHUB_MCP_COMMAND ?? "node",
      args: options.args ?? defaultServerArgs(),
      cwd: options.cwd,
      env: process.env as Record<string, string>,
      stderr: "inherit",
    });

    const client = new Client(
      { name: "token-lab-agent", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    return new GithubMcpClient(client);
  }

  async listToolNames(): Promise<string[]> {
    const { tools } = await this.client.listTools();
    return tools.map((tool) => tool.name);
  }

  async runGithubTool(name: string, input: unknown): Promise<string> {
    const mcpName = toMcpGithubToolName(name);
    const result = await this.client.callTool({
      name: mcpName,
      arguments: (input ?? {}) as Record<string, unknown>,
    });
    return extractMcpText(result as { content?: unknown; isError?: boolean });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
