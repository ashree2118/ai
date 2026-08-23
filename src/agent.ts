#!/usr/bin/env node

import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { executeTools } from "./tool-loop.js";
import { TOOLS } from "./tool-registry.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TURNS = 20;

const SYSTEM_PROMPT = `You are a coding agent with workspace tools (list_files, read_file, run_command) and GitHub tools (github_get_issue, github_list_files, github_read_file, github_create_branch, github_write_file, github_create_pr).

Use workspace tools for local files and shell commands. Use GitHub tools for remote repository operations. GitHub tools require GITHUB_TOKEN and can default owner/repo from GITHUB_OWNER and GITHUB_REPO.`;

function extractText(content: Message["content"]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function isToolUseBlock(block: Message["content"][number]): block is ToolUseBlock {
  return block.type === "tool_use";
}

async function runAgent(task: string, model: string): Promise<string> {
  const client = new Anthropic();
  const messages: MessageParam[] = [{ role: "user", content: task }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = extractText(response.content);
      console.error(
        `done in ${turn} turn(s): stop_reason=${response.stop_reason} input=${response.usage.input_tokens} output=${response.usage.output_tokens}`,
      );
      return text;
    }

    const toolUses = response.content.filter(isToolUseBlock);
    const toolResults = await executeTools(toolUses);
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`stopped after ${MAX_TURNS} tool-use turns`);
}

function parseTask(argv: string[]): string {
  const task = argv.join(" ").trim();
  if (!task) {
    console.error("Usage: agent <task>");
    process.exit(1);
  }
  return task;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const task = parseTask(process.argv.slice(2));
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const answer = await runAgent(task, model);
  console.log(answer);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
