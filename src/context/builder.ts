import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import type { SimilarChunk } from "../rag/store.js";
import { DEFAULT_REACT_SYSTEM_PROMPT } from "../react-agent.js";
import { formatToolHistory } from "./tool-history.js";

export type IssueContext = {
  number?: number;
  title: string;
  body: string;
};

export type ContextSections = {
  systemInstructions: string;
  githubIssue: string;
  repositoryStructure: string;
  ragResults: string;
  episodicMemory: string;
  toolHistory: string;
};

export type StaticContext = {
  systemInstructions: string;
  githubIssue: string;
  repositoryStructure: string;
  ragResults: string;
  episodicMemory: string;
};

const MAX_RAG_SNIPPET_LINES = 12;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

export function formatGithubIssue(issue: IssueContext): string {
  const header = issue.number
    ? `#${issue.number} ${issue.title}`
    : issue.title;
  return `${header}\n${issue.body.trim() || "(no description)"}`;
}

export function formatRepositoryStructure(tree: string): string {
  return tree.trim() || "(empty repository)";
}

export function formatRagResults(chunks: SimilarChunk[]): string {
  if (chunks.length === 0) return "(no retrieved chunks)";

  return chunks
    .map((chunk, index) => {
      const owner = chunk.className ? ` in ${chunk.className}` : "";
      const lines = chunk.code.split("\n").slice(0, MAX_RAG_SNIPPET_LINES).join("\n");
      return [
        `${index + 1}. [${chunk.kind}] ${chunk.symbol}${owner}  ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}  similarity=${chunk.similarity.toFixed(3)}`,
        "```",
        lines,
        "```",
      ].join("\n");
    })
    .join("\n\n");
}

export { formatSimilarEpisodes } from "../memory/episodes.js";

export function buildContextPrompt(sections: ContextSections): string {
  return [
    "## System Instructions",
    sections.systemInstructions.trim(),
    "",
    "## GitHub Issue",
    sections.githubIssue.trim(),
    "",
    "## Repository Structure",
    sections.repositoryStructure.trim(),
    "",
    "## Retrieved Code Context",
    sections.ragResults.trim(),
    "",
    "## Similar Past Episodes",
    sections.episodicMemory.trim(),
    "",
    "## Tool History",
    sections.toolHistory.trim(),
  ].join("\n");
}

export class ContextBuilder {
  private readonly staticContext: StaticContext;

  constructor(staticContext: StaticContext) {
    this.staticContext = staticContext;
  }

  buildSystem(messages: readonly MessageParam[]): string {
    return buildContextPrompt({
      ...this.staticContext,
      toolHistory: formatToolHistory(messages),
    });
  }
}

export const DEFAULT_CONTEXT_INSTRUCTIONS = DEFAULT_REACT_SYSTEM_PROMPT;

export { formatToolHistory } from "./tool-history.js";
