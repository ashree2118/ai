#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const client = new Anthropic();

function usage(): never {
  console.error(`Usage:
  token-lab count <file>
  token-lab compare <file> [file...]

Environment:
  ANTHROPIC_API_KEY   Required
  ANTHROPIC_MODEL     Model for count_tokens (default: ${DEFAULT_MODEL})`);
  process.exit(1);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

async function readText(filePath: string): Promise<string> {
  const absolute = resolve(filePath);
  return readFile(absolute, "utf8");
}

async function countTokens(text: string, model: string): Promise<number> {
  const response = await client.messages.countTokens({
    model,
    messages: [{ role: "user", content: text }],
  });
  return response.input_tokens;
}

async function analyzeFile(filePath: string, model: string) {
  const text = await readText(filePath);
  const characters = text.length;
  const words = countWords(text);
  const tokens = await countTokens(text, model);
  return { filePath, characters, words, tokens };
}

function printStats(
  label: string,
  stats: { characters: number; words: number; tokens: number },
) {
  console.log(`${label}`);
  console.log(`  characters: ${stats.characters}`);
  console.log(`  words:      ${stats.words}`);
  console.log(`  tokens:     ${stats.tokens}`);
}

async function cmdCount(file: string | undefined, model: string) {
  if (!file) usage();
  const stats = await analyzeFile(file, model);
  printStats(stats.filePath, stats);
}

async function cmdCompare(files: string[], model: string) {
  if (files.length < 2) {
    console.error("compare requires at least two files");
    usage();
  }

  const results = await Promise.all(files.map((f) => analyzeFile(f, model)));

  const nameWidth = Math.max(...results.map((r) => r.filePath.length), 4);
  const numWidth = Math.max(
    ...results.flatMap((r) => [
      String(r.characters).length,
      String(r.words).length,
      String(r.tokens).length,
    ]),
    6,
  );

  const header = `${"file".padEnd(nameWidth)}  ${"chars".padStart(numWidth)}  ${"words".padStart(numWidth)}  ${"tokens".padStart(numWidth)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of results) {
    console.log(
      `${r.filePath.padEnd(nameWidth)}  ${String(r.characters).padStart(numWidth)}  ${String(r.words).padStart(numWidth)}  ${String(r.tokens).padStart(numWidth)}`,
    );
  }
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (command !== "count" && command !== "compare") {
    usage();
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  if (command === "count") {
    await cmdCount(args[0], model);
  } else {
    await cmdCompare(args, model);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
