import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import type { SimilarChunk } from "../rag/store.js";
import { DEFAULT_REACT_SYSTEM_PROMPT } from "../react-agent.js";

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
  toolHistory: string;
};

export type StaticContext = {
  systemInstructions: string;
  githubIssue: string;
  repositoryStructure: string;
  ragResults: string;
};

const MAX_TOOL_OUTPUT_CHARS = 240;
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

function summarizeToolResult(content: string | unknown): string {
  const text =
    typeof content === "string" ? content : JSON.stringify(content ?? "");
  const oneLine = text.replace(/\s+/g, " ").trim();
  return truncate(oneLine, MAX_TOOL_OUTPUT_CHARS);
}

export function formatToolHistory(messages: readonly MessageParam[]): string {
  const lines: string[] = [];
  let step = 0;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;

    const toolUses = message.content.filter(
      (block) => block.type === "tool_use",
    );
    if (toolUses.length === 0) continue;

    const next = messages[index + 1];
    const results =
      next?.role === "user" && Array.isArray(next.content)
        ? next.content.filter((block) => block.type === "tool_result")
        : [];

    for (const toolUse of toolUses) {
      step += 1;
      const result = results.find(
        (block) => block.tool_use_id === toolUse.id,
      );
      const status = result?.is_error ? "error" : "ok";
      const output = result
        ? summarizeToolResult(result.content ?? "")
        : "(no result)";
      lines.push(
        `${step}. ${toolUse.name}(${JSON.stringify(toolUse.input)}) -> ${status}: ${output}`,
      );
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(none yet)";
}

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
