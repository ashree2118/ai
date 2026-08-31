import type { ReactAgentResult } from "./react-agent.js";
import { formatCostUsage } from "./cost/pricing.js";

export function printAgentResult(result: ReactAgentResult): void {
  if (!result.completed) {
    console.error(result.partialReason ?? "Partial result: agent stopped early.");
    console.error(`[guardrails] ${result.tokenUsage.totalTokens} tokens across ${result.iterations} iteration(s)`);
    console.error(`[cost] ${formatCostUsage(result.costUsage)}`);
  }

  if (result.text) {
    console.log(result.text);
  }
}

export function exitCodeForAgentResult(result: ReactAgentResult): number {
  return result.completed ? 0 : 1;
}
