import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { formatToolHistory } from "./tool-history.js";

export type ContextManagerOptions = {
  maxMessageChars?: number;
  windowTurns?: number;
  maxSummaryChars?: number;
};

export type PreparedContext = {
  messages: MessageParam[];
  compressed: boolean;
};

const DEFAULT_MAX_MESSAGE_CHARS = 8_000;
const DEFAULT_WINDOW_TURNS = 3;
const DEFAULT_MAX_SUMMARY_CHARS = 2_000;

function readNumber(
  option: number | undefined,
  envName: string,
  fallback: number,
): number {
  if (option !== undefined) return option;
  const fromEnv = process.env[envName];
  if (!fromEnv) return fallback;
  return Number(fromEnv);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

export function estimateMessageChars(messages: readonly MessageParam[]): number {
  return messages.reduce((total, message) => {
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    return total + content.length;
  }, 0);
}

export function groupTurns(messages: readonly MessageParam[]): MessageParam[][] {
  const turns: MessageParam[][] = [];
  let index = 1;

  while (index < messages.length) {
    const turn: MessageParam[] = [messages[index]!];
    index += 1;

    if (index < messages.length && messages[index]!.role === "user") {
      turn.push(messages[index]!);
      index += 1;
    }

    turns.push(turn);
  }

  return turns;
}

function summarizeTurns(turns: readonly MessageParam[][]): string {
  const flat = turns.flat();
  const reasoning: string[] = [];

  for (const message of flat) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();
    if (text) reasoning.push(truncate(text, 120));
  }

  const toolHistory = formatToolHistory(flat);
  const parts: string[] = [];
  if (reasoning.length > 0) {
    parts.push(`Reasoning: ${reasoning.join(" | ")}`);
  }
  if (toolHistory !== "(none yet)") {
    parts.push(`Tools:\n${toolHistory}`);
  }

  return parts.join("\n") || "(no details)";
}

function mergeSummary(
  existing: string,
  addition: string,
  maxChars: number,
): string {
  const merged = existing ? `${existing}\n\n${addition}` : addition;
  if (merged.length <= maxChars) return merged;
  return `…${merged.slice(-(maxChars - 1))}`;
}

export class ContextManager {
  private rollingSummary = "";
  private readonly maxMessageChars: number;
  private readonly windowTurns: number;
  private readonly maxSummaryChars: number;

  constructor(options: ContextManagerOptions = {}) {
    this.maxMessageChars = readNumber(
      options.maxMessageChars,
      "REACT_CONTEXT_MAX_CHARS",
      DEFAULT_MAX_MESSAGE_CHARS,
    );
    this.windowTurns = readNumber(
      options.windowTurns,
      "REACT_CONTEXT_WINDOW_TURNS",
      DEFAULT_WINDOW_TURNS,
    );
    this.maxSummaryChars = options.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS;
  }

  get summary(): string {
    return this.rollingSummary;
  }

  reset(): void {
    this.rollingSummary = "";
  }

  formatSummarySection(): string {
    return [
      "## Conversation Summary",
      this.rollingSummary.trim() || "(none yet)",
    ].join("\n");
  }

  prepare(messages: readonly MessageParam[]): PreparedContext {
    if (messages.length <= 1) {
      return { messages: [...messages], compressed: false };
    }

    const task = messages[0]!;
    const turns = groupTurns(messages);
    const charCount = estimateMessageChars(messages);
    const overCharBudget = charCount > this.maxMessageChars;
    const overTurnBudget = turns.length > this.windowTurns;

    if (!overCharBudget && !overTurnBudget) {
      return { messages: [...messages], compressed: false };
    }

    const keepTurns = Math.min(this.windowTurns, turns.length);
    const droppedTurns = turns.slice(0, turns.length - keepTurns);
    const recentTurns = turns.slice(-keepTurns);

    if (droppedTurns.length > 0) {
      this.rollingSummary = mergeSummary(
        this.rollingSummary,
        summarizeTurns(droppedTurns),
        this.maxSummaryChars,
      );
    }

    return {
      messages: [task, ...recentTurns.flat()],
      compressed: droppedTurns.length > 0,
    };
  }
}
