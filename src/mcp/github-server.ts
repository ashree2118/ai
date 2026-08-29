#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runTool } from "../tool-registry.js";
import {
  buildMcpToolDefinitions,
  toAgentGithubToolName,
} from "./github-tools.js";

async function main() {
  const server = new Server(
    { name: "github-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  const tools = buildMcpToolDefinitions();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const agentToolName = toAgentGithubToolName(request.params.name);
      const output = await runTool(
        agentToolName,
        request.params.arguments ?? {},
      );
      return {
        content: [{ type: "text", text: output }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
