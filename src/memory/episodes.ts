import type { ReactAgentResult } from "../react-agent.js";
import type { ScratchpadState } from "./scratchpad.js";

export type IssueType =
  | "bug_fix"
  | "feature"
  | "refactor"
  | "test"
  | "docs"
  | "investigation";

export type EpisodeInput = {
  issueType: IssueType;
  issueText: string;
  filesChanged: string[];
  approach: string;
  whatWorked: string;
  whatFailed: string;
  result: string;
  completed: boolean;
};

export type SimilarEpisode = EpisodeInput & {
  id: string;
  similarity: number;
};

function summarize(text: string, max = 400): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

export function inferIssueType(task: string, issueText = ""): IssueType {
  const text = `${task}\n${issueText}`.toLowerCase();

  if (/\b(bug|fix|error|broken|regression|fails?)\b/.test(text)) {
    return "bug_fix";
  }
  if (/\b(add|implement|create|introduce|support)\b/.test(text)) {
    return "feature";
  }
  if (/\b(refactor|cleanup|restructure|rename)\b/.test(text)) {
    return "refactor";
  }
  if (/\b(test|coverage|spec)\b/.test(text)) {
    return "test";
  }
  if (/\b(doc|readme|comment)\b/.test(text)) {
    return "docs";
  }
  return "investigation";
}

export function buildEpisodeFromRun(input: {
  task: string;
  issueText?: string;
  result: ReactAgentResult;
  scratchpad?: ScratchpadState;
}): EpisodeInput {
  const issueText = input.issueText?.trim() || input.task.trim();
  const scratchpad = input.scratchpad;
  const failures = (scratchpad?.discoveries ?? []).filter((item) =>
    /\bfailed\b/i.test(item),
  );
  const successes = [
    ...(scratchpad?.testResults ?? []),
    ...(scratchpad?.discoveries ?? []).filter((item) => !/\bfailed\b/i.test(item)),
  ];

  if (!input.result.completed && input.result.partialReason) {
    failures.push(input.result.partialReason);
  }

  return {
    issueType: inferIssueType(input.task, issueText),
    issueText,
    filesChanged: scratchpad?.changedFiles ?? [],
    approach: (scratchpad?.plan ?? []).join(" → ") || "Explore repository and respond",
    whatWorked: successes.length > 0 ? successes.join("; ") : "(none recorded)",
    whatFailed: failures.length > 0 ? failures.join("; ") : "(none recorded)",
    result: summarize(input.result.text || "(no final text)", 600),
    completed: input.result.completed,
  };
}

export function episodeEmbeddingText(episode: EpisodeInput): string {
  return [
    `issue_type: ${episode.issueType}`,
    `issue: ${episode.issueText}`,
    `files_changed: ${episode.filesChanged.join(", ") || "(none)"}`,
    `approach: ${episode.approach}`,
    `worked: ${episode.whatWorked}`,
    `failed: ${episode.whatFailed}`,
    `result: ${episode.result}`,
  ].join("\n");
}

export function formatSimilarEpisodes(episodes: SimilarEpisode[]): string {
  if (episodes.length === 0) return "(no similar past episodes)";

  return episodes
    .map((episode, index) => {
      return [
        `${index + 1}. [${episode.issueType}] similarity=${episode.similarity.toFixed(3)} completed=${episode.completed}`,
        `Issue: ${summarize(episode.issueText, 200)}`,
        `Files changed: ${episode.filesChanged.join(", ") || "(none)"}`,
        `Approach: ${summarize(episode.approach, 180)}`,
        `Worked: ${summarize(episode.whatWorked, 180)}`,
        `Failed: ${summarize(episode.whatFailed, 180)}`,
        `Result: ${summarize(episode.result, 220)}`,
      ].join("\n");
    })
    .join("\n\n");
}
