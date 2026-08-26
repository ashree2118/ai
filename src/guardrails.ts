import type { Usage } from "@anthropic-ai/sdk/resources/messages/messages";

export type TokenUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function emptyTokenUsage(): TokenUsageTotals {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export function addUsage(
  totals: TokenUsageTotals,
  usage: Pick<Usage, "input_tokens" | "output_tokens">,
): TokenUsageTotals {
  const inputTokens = totals.inputTokens + usage.input_tokens;
  const outputTokens = totals.outputTokens + usage.output_tokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export function exceedsTokenBudget(
  totals: TokenUsageTotals,
  maxTokenBudget?: number,
): boolean {
  if (maxTokenBudget === undefined) return false;
  return totals.totalTokens >= maxTokenBudget;
}

export function partialReasonForIterations(
  iterations: number,
  maxIterations: number,
): string {
  return `Partial result: iteration limit reached (${iterations}/${maxIterations}).`;
}

export function partialReasonForTokenBudget(
  totals: TokenUsageTotals,
  maxTokenBudget: number,
): string {
  return `Partial result: token budget exceeded (${totals.totalTokens}/${maxTokenBudget}; input=${totals.inputTokens}, output=${totals.outputTokens}).`;
}

export function formatTokenUsage(totals: TokenUsageTotals): string {
  return `tokens total=${totals.totalTokens} input=${totals.inputTokens} output=${totals.outputTokens}`;
}
