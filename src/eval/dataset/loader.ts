import { AGENT_EVAL_DATASET } from "./issues.js";
import type { AgentEvalIssue, EvalSplit } from "./types.js";

export type { AgentEvalIssue, EvalSplit } from "./types.js";

export type EvalDatasetSummary = {
  total: number;
  trainCount: number;
  testCount: number;
  repositories: string[];
};

export function loadEvalDataset(): readonly AgentEvalIssue[] {
  return AGENT_EVAL_DATASET;
}

export function loadEvalSplit(split: EvalSplit): AgentEvalIssue[] {
  return AGENT_EVAL_DATASET.filter((issue) => issue.split === split);
}

export function loadEvalIssues(options?: {
  split?: EvalSplit | "all";
  ids?: string[];
}): AgentEvalIssue[] {
  let issues = [...AGENT_EVAL_DATASET];

  if (options?.split && options.split !== "all") {
    issues = issues.filter((issue) => issue.split === options.split);
  }

  if (options?.ids && options.ids.length > 0) {
    const wanted = new Set(options.ids);
    issues = issues.filter((issue) => wanted.has(issue.id));
  }

  return issues;
}

export function getEvalIssue(id: string): AgentEvalIssue | undefined {
  return AGENT_EVAL_DATASET.find((issue) => issue.id === id);
}

export function toEvalQuery(issue: AgentEvalIssue): string {
  return [issue.title, issue.issueText, issue.approach].join("\n\n");
}

export function summarizeEvalDataset(
  issues: readonly AgentEvalIssue[] = AGENT_EVAL_DATASET,
): EvalDatasetSummary {
  const repositories = [
    ...new Set(issues.map((issue) => `${issue.repository.owner}/${issue.repository.repo}`)),
  ].sort();

  return {
    total: issues.length,
    trainCount: issues.filter((issue) => issue.split === "train").length,
    testCount: issues.filter((issue) => issue.split === "test").length,
    repositories,
  };
}

export function datasetCorpusFiles(
  issues: readonly AgentEvalIssue[] = AGENT_EVAL_DATASET,
): string[] {
  const files = new Set<string>();
  for (const issue of issues) {
    for (const file of issue.correctFiles) {
      files.add(file);
    }
  }
  return [...files].sort();
}

export function toRetrievalEvalIssue(issue: AgentEvalIssue): {
  id: string;
  title: string;
  query: string;
  relevantFiles: string[];
} {
  return {
    id: issue.id,
    title: issue.title,
    query: toEvalQuery(issue),
    relevantFiles: issue.correctFiles,
  };
}
