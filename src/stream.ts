#!/usr/bin/env node

import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type {
  MessageDeltaUsage,
  StopReason,
} from "@anthropic-ai/sdk/resources/messages/messages";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

type StreamResult = {
  stopReason: StopReason | null;
  usage: MessageDeltaUsage | null;
};

function parseArgs(argv: string[]): { prompt: string; system?: string } {
  const parts: string[] = [];
  let system: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--system" && argv[i + 1]) {
      system = argv[++i];
      continue;
    }
    parts.push(argv[i]!);
  }

  const prompt = parts.join(" ").trim();
  if (!prompt) {
    console.error("Usage: stream <prompt>");
    console.error("       stream --system \"...\" <prompt>");
    process.exit(1);
  }

  return { prompt, system };
}

function printStreamError(err: unknown): void {
  if (err instanceof APIError) {
    console.error(
      `\nstream error [${err.status ?? "unknown"}]: ${err.message}`,
    );
    return;
  }

  if (err instanceof Error) {
    console.error(`\nstream error: ${err.message}`);
    return;
  }

  console.error("\nstream error:", err);
}

async function streamPrompt(
  prompt: string,
  system: string | undefined,
  model: string,
): Promise<StreamResult> {
  const client = new Anthropic();
  let stopReason: StopReason | null = null;
  let usage: MessageDeltaUsage | null = null;
  let completed = false;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  try {
    for await (const event of response) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          process.stdout.write(event.delta.text);
        }
        continue;
      }

      if (event.type === "message_delta") {
        stopReason = event.delta.stop_reason;
        usage = event.usage;
        continue;
      }

      if (event.type === "message_stop") {
        completed = true;
      }
    }
  } catch (err) {
    process.stdout.write("\n");
    printStreamError(err);
    throw err;
  }

  if (!completed) {
    throw new Error("stream ended without message_stop");
  }

  process.stdout.write("\n");
  console.error(
    `complete: stop_reason=${stopReason ?? "unknown"} input=${usage?.input_tokens ?? "?"} output=${usage?.output_tokens ?? "?"}`,
  );

  return { stopReason, usage };
}

async function main() {
  const { prompt, system } = parseArgs(process.argv.slice(2));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  try {
    await streamPrompt(prompt, system, model);
  } catch {
    process.exit(1);
  }
}

main();
