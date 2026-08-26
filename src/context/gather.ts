import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { runGithubTool } from "../github/toolkit.js";
import { ChunkVectorStore } from "../rag/store.js";
import {
  ContextBuilder,
  DEFAULT_CONTEXT_INSTRUCTIONS,
  formatGithubIssue,
  formatRagResults,
  formatRepositoryStructure,
  type IssueContext,
  type StaticContext,
} from "./builder.js";

export type GatherContextOptions = {
  task: string;
  issueNumber?: number;
  issueText?: string;
  ragTopK?: number;
  repoRoot?: string;
  instructions?: string;
  ragStore?: ChunkVectorStore;
};

async function walkRepo(
  root: string,
  current = ".",
  depth = 0,
  maxDepth = 2,
): Promise<string[]> {
  if (depth > maxDepth) return [];

  const absolute = join(root, current);
  const entries = await readdir(absolute, { withFileTypes: true });
  const lines: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
      continue;
    }

    const rel = relative(root, join(absolute, entry.name)).replace(/\\/g, "/");
    const info = await stat(join(absolute, entry.name));

    if (info.isDirectory()) {
      lines.push(`${rel}/`);
      lines.push(
        ...(await walkRepo(root, rel, depth + 1, maxDepth)).map((line) => `  ${line}`),
      );
      continue;
    }

    lines.push(rel);
  }

  return lines;
}

async function fetchGithubIssue(issueNumber: number): Promise<IssueContext> {
  const raw = await runGithubTool("github_get_issue", { issue_number: issueNumber });
  const parsed = JSON.parse(raw) as {
    number: number;
    title: string;
    body: string | null;
  };

  return {
    number: parsed.number,
    title: parsed.title,
    body: parsed.body ?? "",
  };
}

async function fetchRagResults(
  query: string,
  topK: number,
  store?: ChunkVectorStore,
): Promise<string> {
  if (!process.env.DATABASE_URL) {
    return "(RAG store unavailable: DATABASE_URL is not set)";
  }

  const ragStore = store ?? ChunkVectorStore.connect();
  const shouldClose = !store;

  try {
    const chunks = await ragStore.searchSimilar(query, topK);
    return formatRagResults(chunks);
  } finally {
    if (shouldClose) await ragStore.close();
  }
}

export async function gatherStaticContext(
  options: GatherContextOptions,
): Promise<StaticContext> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const ragTopK = options.ragTopK ?? 5;

  let issue: IssueContext;
  if (options.issueText) {
    issue = { title: "Provided Issue", body: options.issueText };
  } else if (options.issueNumber !== undefined) {
    issue = await fetchGithubIssue(options.issueNumber);
  } else {
    issue = { title: "No GitHub issue provided", body: options.task };
  }

  const repoTree = formatRepositoryStructure(
    (await walkRepo(repoRoot)).join("\n"),
  );

  const ragQuery = [issue.title, issue.body, options.task].filter(Boolean).join("\n");
  const ragResults = await fetchRagResults(
    ragQuery,
    ragTopK,
    options.ragStore,
  );

  return {
    systemInstructions: options.instructions ?? DEFAULT_CONTEXT_INSTRUCTIONS,
    githubIssue: formatGithubIssue(issue),
    repositoryStructure: repoTree,
    ragResults,
  };
}

export async function createContextBuilder(
  options: GatherContextOptions,
): Promise<ContextBuilder> {
  const staticContext = await gatherStaticContext(options);
  return new ContextBuilder(staticContext);
}

export function buildUserTask(task: string): string {
  return `## Task\n${task.trim()}`;
}
