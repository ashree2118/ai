import { chunkFiles } from "../chunker/chunker.js";
import { ChunkVectorStore } from "../rag/store.js";
import {
  datasetCorpusFiles,
  loadEvalIssues,
  toRetrievalEvalIssue,
  type EvalSplit,
} from "./dataset/loader.js";
import { EVAL_CORPUS_FILES, EVAL_ISSUES } from "./issues.js";
import {
  evaluateRetrieval,
  normalizeFilePath,
  summarizeEval,
  type EvalSummary,
  type IssueEvalResult,
} from "./metrics.js";

const MAX_K = 10;

export function retrievedFilesFromChunks(
  chunks: Array<{ filePath: string }>,
): string[] {
  return chunks.map((chunk) => normalizeFilePath(chunk.filePath));
}

export async function indexEvalCorpus(store: ChunkVectorStore): Promise<number> {
  const results = await chunkFiles(EVAL_CORPUS_FILES);
  const chunks = results.flatMap((result) => result.chunks);
  return store.upsertChunks(chunks);
}

export async function indexDatasetCorpus(
  store: ChunkVectorStore,
  split: EvalSplit | "all" = "all",
): Promise<number> {
  const files = datasetCorpusFiles(loadEvalIssues({ split }));
  const results = await chunkFiles(files);
  const chunks = results.flatMap((result) => result.chunks);
  return store.upsertChunks(chunks);
}

export async function runRetrievalEval(
  store: ChunkVectorStore,
): Promise<EvalSummary> {
  const results: IssueEvalResult[] = [];

  for (const issue of EVAL_ISSUES) {
    const chunks = await store.searchSimilar(issue.query, MAX_K);
    const retrievedFiles = retrievedFilesFromChunks(chunks);

    results.push(
      evaluateRetrieval({
        issueId: issue.id,
        title: issue.title,
        query: issue.query,
        relevantFiles: issue.relevantFiles,
        retrievedFiles,
      }),
    );
  }

  return summarizeEval(results);
}

export async function runDatasetRetrievalEval(
  store: ChunkVectorStore,
  split: EvalSplit | "all" = "all",
): Promise<EvalSummary> {
  const issues = loadEvalIssues({ split }).map(toRetrievalEvalIssue);
  const results: IssueEvalResult[] = [];

  for (const issue of issues) {
    const chunks = await store.searchSimilar(issue.query, MAX_K);
    const retrievedFiles = retrievedFilesFromChunks(chunks);

    results.push(
      evaluateRetrieval({
        issueId: issue.id,
        title: issue.title,
        query: issue.query,
        relevantFiles: issue.relevantFiles,
        retrievedFiles,
      }),
    );
  }

  return summarizeEval(results);
}

export async function runDatasetEvalPipeline(
  split: EvalSplit | "all" = "all",
): Promise<EvalSummary> {
  const store = ChunkVectorStore.connect();
  try {
    await store.migrate();
    const indexed = await indexDatasetCorpus(store, split);
    const issues = loadEvalIssues({ split });
    console.error(
      `indexed ${indexed} chunks for dataset split=${split} (${issues.length} issues)`,
    );
    return runDatasetRetrievalEval(store, split);
  } finally {
    await store.close();
  }
}

export async function runEvalPipeline(): Promise<EvalSummary> {
  const store = ChunkVectorStore.connect();
  try {
    await store.migrate();
    const indexed = await indexEvalCorpus(store);
    console.error(`indexed ${indexed} chunks from ${EVAL_CORPUS_FILES.length} files`);
    return runRetrievalEval(store);
  } finally {
    await store.close();
  }
}

export function formatEvalReport(summary: EvalSummary): string {
  const lines: string[] = [];

  lines.push("retrieval evaluation");
  lines.push(`issues: ${summary.issueCount}`);
  lines.push(
    `mean Precision@1:  ${summary.meanPrecisionAt1.toFixed(4)}`,
  );
  lines.push(
    `mean Precision@5:  ${summary.meanPrecisionAt5.toFixed(4)}`,
  );
  lines.push(
    `mean Precision@10: ${summary.meanPrecisionAt10.toFixed(4)}`,
  );
  lines.push("");

  for (const result of summary.results) {
    lines.push(`${result.issueId}: ${result.title}`);
    lines.push(`  query: ${result.query}`);
    lines.push(`  relevant: ${result.relevantFiles.join(", ")}`);
    lines.push(
      `  P@1=${result.precisionAt1.toFixed(4)}  P@5=${result.precisionAt5.toFixed(4)}  P@10=${result.precisionAt10.toFixed(4)}`,
    );
    lines.push(`  retrieved: ${result.retrievedFiles.join(", ") || "(none)"}`);
    lines.push("");
  }

  if (summary.failures.length > 0) {
    lines.push(`failures (${summary.failures.length}):`);
    for (const failure of summary.failures) {
      const missing = failure.relevantFiles.filter(
        (file) => !failure.retrievedFiles.slice(0, MAX_K).includes(file),
      );
      lines.push(`  - ${failure.issueId}: missing ${missing.join(", ")}`);
      lines.push(`    retrieved: ${failure.retrievedFiles.join(", ")}`);
    }
  } else {
    lines.push("failures: none");
  }

  return lines.join("\n");
}


//Is chunking bad?
//Is the issue too vague?
//Are metadata fields missing?
//Is the embedding model appropriate for code?
//Is top-K too small?
//Would keyword search help?
//Does the relevant code use an exact identifier?