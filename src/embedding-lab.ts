#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { embedTexts } from "./embeddings/client.js";
import { pca2D, topKSimilar } from "./embeddings/math.js";
import { SNIPPETS } from "./embeddings/snippets.js";
import { renderSvg, type Point } from "./embeddings/visualize.js";

const DEFAULT_QUERY = "binary search function in typescript";

function parseQuery(argv: string[]): string {
  const query = argv.join(" ").trim();
  return query || DEFAULT_QUERY;
}

async function main() {
  const query = parseQuery(process.argv.slice(2));
  const texts = SNIPPETS.map((snippet) => snippet.code);

  console.error(`embedding ${SNIPPETS.length} snippets...`);
  const snippetVectors = await embedTexts(texts);

  const stored = SNIPPETS.map((snippet, index) => ({
    ...snippet,
    vector: snippetVectors[index]!,
  }));

  console.error("embedding query...");
  const [queryVector] = await embedTexts([query]);

  const top = topKSimilar(queryVector!, stored, 5);

  console.log(`query: ${query}\n`);
  console.log("top 5 matches:");
  for (const [index, match] of top.entries()) {
    console.log(
      `${index + 1}. ${match.label} (${match.id})  similarity=${match.score.toFixed(4)}`,
    );
    console.log(match.code.split("\n")[0] + "...");
    console.log();
  }

  const allVectors = [...snippetVectors, queryVector!];
  const coords = pca2D(allVectors);
  const points: Point[] = SNIPPETS.map((snippet, index) => ({
    id: snippet.id,
    label: snippet.label,
    x: coords[index]![0]!,
    y: coords[index]![1]!,
  }));
  points.push({
    id: "query",
    label: "query",
    x: coords[coords.length - 1]![0]!,
    y: coords[coords.length - 1]![1]!,
    isQuery: true,
  });

  const outputPath = resolve("embedding-map.svg");
  await writeFile(outputPath, renderSvg(points), "utf8");
  console.error(`wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
