import type { ReactAgentResult } from "../react-agent.js";
import type { TokenUsageTotals } from "../guardrails.js";

export type TraceToolCall = {
  iteration: number;
  toolUseId: string;
  name: string;
  input: unknown;
};

export type TraceToolResult = {
  iteration: number;
  toolUseId: string;
  name: string;
  ok: boolean;
  output: string;
};

export type TraceIteration = {
  iteration: number;
  assistantText: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  cumulativeTokens: TokenUsageTotals;
  toolCalls: TraceToolCall[];
  toolResults: TraceToolResult[];
};

export type AgentTraceRecord = {
  issueId: string;
  startedAt: string;
  finishedAt?: string;
  iterations: TraceIteration[];
  outcome?: {
    completed: boolean;
    stopReason: string;
    partialReason?: string;
    finalText: string;
    tokenUsage: TokenUsageTotals;
  };
};

function summarizeOutput(output: string, max = 300): string {
  const oneLine = output.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

export class AgentTrace {
  private readonly issueId: string;
  private readonly startedAt = new Date().toISOString();
  private iterations: TraceIteration[] = [];
  private current?: TraceIteration;

  constructor(issueId: string) {
    this.issueId = issueId;
  }

  startIteration(iteration: number): void {
    this.current = {
      iteration,
      assistantText: "",
      stopReason: "pending",
      usage: { inputTokens: 0, outputTokens: 0 },
      cumulativeTokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      toolCalls: [],
      toolResults: [],
    };
    this.iterations.push(this.current);
    this.log(`iteration ${iteration} start`);
  }

  recordLlmResponse(input: {
    assistantText: string;
    stopReason: string;
    inputTokens: number;
    outputTokens: number;
    cumulativeTokens: TokenUsageTotals;
  }): void {
    if (!this.current) return;
    this.current.assistantText = input.assistantText;
    this.current.stopReason = input.stopReason;
    this.current.usage = {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    };
    this.current.cumulativeTokens = input.cumulativeTokens;
    this.log(
      `iteration ${this.current.iteration} llm stop_reason=${input.stopReason} cumulative_total=${input.cumulativeTokens.totalTokens}`,
    );
    if (input.assistantText) {
      this.log(
        `iteration ${this.current.iteration} assistant: ${summarizeOutput(input.assistantText, 160)}`,
      );
    }
  }

  recordToolCall(call: TraceToolCall): void {
    if (!this.current) return;
    this.current.toolCalls.push(call);
    this.log(
      `iteration ${call.iteration} tool_call ${call.name}(${JSON.stringify(call.input)})`,
    );
  }

  recordToolResult(result: TraceToolResult): void {
    if (!this.current) return;
    this.current.toolResults.push(result);
    this.log(
      `iteration ${result.iteration} tool_result ${result.name} ${result.ok ? "ok" : "error"}: ${summarizeOutput(result.output)}`,
    );
  }

  finish(result: ReactAgentResult): void {
    this.log(
      `outcome completed=${result.completed} stop_reason=${result.stopReason} iterations=${result.iterations}`,
    );
    if (result.partialReason) {
      this.log(`outcome partial_reason: ${result.partialReason}`);
    }
    if (result.text) {
      this.log(`outcome final: ${summarizeOutput(result.text, 240)}`);
    }
  }

  toRecord(result?: ReactAgentResult): AgentTraceRecord {
    return {
      issueId: this.issueId,
      startedAt: this.startedAt,
      finishedAt: result ? new Date().toISOString() : undefined,
      iterations: this.iterations,
      outcome: result
        ? {
            completed: result.completed,
            stopReason: result.stopReason,
            partialReason: result.partialReason,
            finalText: result.text,
            tokenUsage: result.tokenUsage,
          }
        : undefined,
    };
  }

  formatReport(): string {
    const lines: string[] = [
      `# Agent Trace: ${this.issueId}`,
      "",
      `started: ${this.startedAt}`,
    ];

    for (const iteration of this.iterations) {
      lines.push("", `## Iteration ${iteration.iteration}`);
      lines.push(`- stop_reason: ${iteration.stopReason}`);
      lines.push(
        `- tokens: input=${iteration.usage.inputTokens} output=${iteration.usage.outputTokens} cumulative=${iteration.cumulativeTokens.totalTokens}`,
      );
      if (iteration.assistantText) {
        lines.push("", "assistant:", iteration.assistantText);
      }
      for (const call of iteration.toolCalls) {
        lines.push(
          "",
          `tool_call: ${call.name}`,
          "```json",
          JSON.stringify(call.input, null, 2),
          "```",
        );
      }
      for (const result of iteration.toolResults) {
        lines.push(
          "",
          `tool_result: ${result.name} (${result.ok ? "ok" : "error"})`,
          "```",
          result.output,
          "```",
        );
      }
    }

    const record = this.toRecord();
    if (record.outcome) {
      lines.push("", "## Outcome");
      lines.push(`- completed: ${record.outcome.completed}`);
      lines.push(`- stop_reason: ${record.outcome.stopReason}`);
      if (record.outcome.partialReason) {
        lines.push(`- partial_reason: ${record.outcome.partialReason}`);
      }
      lines.push(
        `- total_tokens: ${record.outcome.tokenUsage.totalTokens} (input=${record.outcome.tokenUsage.inputTokens}, output=${record.outcome.tokenUsage.outputTokens})`,
      );
      if (record.outcome.finalText) {
        lines.push("", "final_response:", record.outcome.finalText);
      }
    }

    return lines.join("\n");
  }

  private log(message: string): void {
    console.error(`[trace] ${message}`);
  }
}
