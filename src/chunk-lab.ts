#!/usr/bin/env node

import { chunkFiles, inspectChunk, summarizeChunks } from "./chunker/chunker.js";

function usage(): never {
  console.error(`Usage:
  chunk-lab chunk <file> [file...]
  chunk-lab inspect <file> [--symbol <name>] [--json]

Examples:
  chunk-lab chunk src/chunker/chunker.ts
  chunk-lab inspect src/chunker/chunker.ts --symbol collectChunks`);
  process.exit(1);
}

function parseInspectArgs(argv: string[]): {
  file?: string;
  symbol?: string;
  json: boolean;
} {
  const options: { file?: string; symbol?: string; json: boolean } = {
    json: false,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--symbol" && argv[i + 1]) {
      options.symbol = argv[++i];
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    positional.push(arg);
  }

  options.file = positional[0];
  return options;
}

async function cmdChunk(files: string[]) {
  if (files.length === 0) usage();
  const results = await chunkFiles(files);
  console.log(summarizeChunks(results));
}

async function cmdInspect(argv: string[]) {
  const { file, symbol, json } = parseInspectArgs(argv);
  if (!file) usage();

  const [result] = await chunkFiles([file]);
  if (!result) usage();

  const chunks = symbol
    ? result.chunks.filter((chunk) => chunk.symbol === symbol)
    : result.chunks;

  if (chunks.length === 0) {
    console.error(symbol ? `no chunk found for symbol: ${symbol}` : "no chunks found");
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(chunks, null, 2));
    return;
  }

  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) console.log("\n---\n");
    console.log(inspectChunk(chunk));
  }
}

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "chunk":
      await cmdChunk(args);
      break;
    case "inspect":
      await cmdInspect(args);
      break;
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
