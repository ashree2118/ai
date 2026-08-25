#!/usr/bin/env node

import { chunkFiles } from "./chunker/chunker.js";
import { ChunkVectorStore } from "./rag/store.js";

function usage(): never {
  console.error(`Usage:
  rag-cli migrate
  rag-cli index <file> [file...]
  rag-cli search <query> [--top <k>]

Environment:
  DATABASE_URL        PostgreSQL connection string (pgvector enabled)
  OPENAI_API_KEY      Required for indexing and search`);
  process.exit(1);
}

function parseSearchArgs(argv: string[]): { query: string; topK: number } {
  const parts: string[] = [];
  let topK = 5;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--top" && argv[i + 1]) {
      topK = Number(argv[++i]);
      continue;
    }
    parts.push(argv[i]!);
  }

  const query = parts.join(" ").trim();
  if (!query) usage();
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("--top must be a positive integer");
  }

  return { query, topK };
}

async function withStore<T>(fn: (store: ChunkVectorStore) => Promise<T>) {
  const store = ChunkVectorStore.connect();
  try {
    return await fn(store);
  } finally {
    await store.close();
  }
}

async function cmdMigrate() {
  await withStore(async (store) => {
    await store.migrate();
    console.log("schema migrated");
  });
}

async function cmdIndex(files: string[]) {
  if (files.length === 0) usage();

  const results = await chunkFiles(files);
  const chunks = results.flatMap((result) => result.chunks);

  await withStore(async (store) => {
    await store.migrate();
    const inserted = await store.upsertChunks(chunks);
    const total = await store.count();
    console.log(`indexed ${inserted} chunks (${total} total in store)`);
  });
}

async function cmdSearch(argv: string[]) {
  const { query, topK } = parseSearchArgs(argv);

  await withStore(async (store) => {
    const matches = await store.searchSimilar(query, topK);
    console.log(`query: ${query}\n`);

    if (matches.length === 0) {
      console.log("no matches");
      return;
    }

    for (const [index, match] of matches.entries()) {
      const owner = match.className ? ` in ${match.className}` : "";
      console.log(
        `${index + 1}. [${match.kind}] ${match.symbol}${owner}  ${match.filePath}:${match.startLine}-${match.endLine}  similarity=${match.similarity.toFixed(4)}`,
      );
      console.log(match.code.split("\n")[0] + "...");
      console.log();
    }
  });
}

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "migrate":
      await cmdMigrate();
      break;
    case "index":
      await cmdIndex(args);
      break;
    case "search":
      await cmdSearch(args);
      break;
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
