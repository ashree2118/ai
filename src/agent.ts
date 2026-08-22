#!/usr/bin/env node

import { exec } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";

const execAsync = promisify(exec);
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TURNS = 20;

const TOOLS: Tool[] = [
  {
    name: "list_files",
    description: "List files and directories at a path.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
      },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Read a text file and return its contents.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the workspace and return stdout/stderr.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
      },
      required: ["command"],
    },
  },
];

function workspaceRoot(): string {
  return resolve(process.cwd());
}

function safePath(path: string): string {
  const root = workspaceRoot();
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escapes workspace: ${path}`);
  }
  return target;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  throw new Error("tool input must be an object");
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

async function runTool(name: string, input: unknown): Promise<string> {
  const args = asRecord(input);

  switch (name) {
    case "list_files": {
      const dir = safePath(asString(args.path, "path"));
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .map((entry) => `${entry.isDirectory() ? "[dir]" : "[file]"} ${entry.name}`)
        .join("\n");
    }
    case "read_file": {
      const file = safePath(asString(args.path, "path"));
      return await readFile(file, "utf8");
    }
    case "run_command": {
      const command = asString(args.command, "command");
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: workspaceRoot(),
          maxBuffer: 1024 * 1024,
          timeout: 30_000,
        });
        return [stdout, stderr].filter(Boolean).join("\n") || "(no output)";
      } catch (err) {
        const error = err as { stdout?: string; stderr?: string; message?: string };
        const parts = [error.stdout, error.stderr, error.message].filter(Boolean);
        return parts.join("\n");
      }
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function extractText(content: Message["content"]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function isToolUseBlock(block: Message["content"][number]): block is ToolUseBlock {
  return block.type === "tool_use";
}

async function executeTools(toolUses: ToolUseBlock[]): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];

  for (const toolUse of toolUses) {
    try {
      const output = await runTool(toolUse.name, toolUse.input);
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: output,
      });
      console.error(`tool ${toolUse.name} ok`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: message,
        is_error: true,
      });
      console.error(`tool ${toolUse.name} error: ${message}`);
    }
  }

  return results;
}

async function runAgent(task: string, model: string): Promise<string> {
  const client = new Anthropic();
  const messages: MessageParam[] = [{ role: "user", content: task }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system:
        "You are a coding agent with filesystem and shell tools. Use tools when needed, then give a concise final answer.",
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
