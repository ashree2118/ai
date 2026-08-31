import { randomUUID } from "node:crypto";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  startObservation,
  type LangfuseAgent,
} from "@langfuse/tracing";
import {
  ensureLangfuseOtel,
  flushLangfuseSpans,
  isLangfuseConfigured,
} from "./langfuse-setup.js";

export type AgentRunTraceResult = {
  text: string;
  iterations: number;
  stopReason: string;
  completed: boolean;
  partialReason?: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  costUsage: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    callCount: number;
  };
};

export type AgentLangfuseTracerOptions = {
  runId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

export type LlmCallTraceInput = {
  iteration: number;
  model: string;
  system: string;
  messages: readonly MessageParam[];
};

export type LlmCallTraceResult = {
  iteration: number;
  model: string;
  stopReason: string;
  assistantText: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  callCostUsd: number;
};

export type LlmCallTraceError = {
  iteration: number;
  model: string;
  system: string;
  messages: readonly MessageParam[];
  latencyMs: number;
  error: unknown;
};

export type ToolCallTraceRecord = {
  iteration: number;
  toolUseId: string;
  name: string;
  input: unknown;
  ok: boolean;
  output: string;
  latencyMs: number;
};

export interface AgentLangfuseTracer {
  readonly enabled: boolean;
  readonly traceId: string | null;
  readonly runId: string;
  startRun(input: { task: string; model: string }): void;
  recordLlmCall(result: LlmCallTraceResult & LlmCallTraceInput): void;
  recordLlmError(error: LlmCallTraceError): void;
  recordToolCall(record: ToolCallTraceRecord): void;
  finishRun(result: AgentRunTraceResult): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeMessages(messages: readonly MessageParam[]): unknown[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export class NoopAgentLangfuseTracer implements AgentLangfuseTracer {
  readonly enabled = false;
  readonly traceId = null;
  readonly runId: string;

  constructor(runId?: string) {
    this.runId = runId ?? randomUUID();
  }

  startRun(_input: { task: string; model: string }): void {}
  recordLlmCall(_input: LlmCallTraceResult & LlmCallTraceInput): void {}
  recordLlmError(_input: LlmCallTraceError): void {}
  recordToolCall(_record: ToolCallTraceRecord): void {}
  async finishRun(_result: AgentRunTraceResult): Promise<void> {}
}

export class LangfuseAgentTracer implements AgentLangfuseTracer {
  readonly enabled = true;
  readonly runId: string;
  private root?: LangfuseAgent;
  private readonly sessionId?: string;
  private readonly metadata?: Record<string, unknown>;

  constructor(options: AgentLangfuseTracerOptions = {}) {
    ensureLangfuseOtel();
    this.runId = options.runId ?? randomUUID();
    this.sessionId = options.sessionId;
    this.metadata = options.metadata;
  }

  get traceId(): string | null {
    return this.root?.traceId ?? null;
  }

  startRun(input: { task: string; model: string }): void {
    this.root = startObservation(
      "react-agent-run",
      {
        input: { task: input.task },
        metadata: {
          runId: this.runId,
          model: input.model,
          sessionId: this.sessionId,
          ...this.metadata,
        },
      },
      { asType: "agent" },
    );
  }

  recordLlmCall(
    input: LlmCallTraceResult & LlmCallTraceInput,
  ): void {
    if (!this.root) return;

    const generation = this.root.startObservation(
      `llm-iteration-${input.iteration}`,
      {
        model: input.model,
        input: {
          system: input.system,
          messages: summarizeMessages(input.messages),
        },
        metadata: {
          runId: this.runId,
          traceId: this.traceId,
          iteration: input.iteration,
          latencyMs: input.latencyMs,
          stopReason: input.stopReason,
          toolCalls: input.toolCalls,
        },
      },
      { asType: "generation" },
    );

    generation.update({
      output: {
        stopReason: input.stopReason,
        text: input.assistantText,
        toolCalls: input.toolCalls,
      },
      usageDetails: {
        input: input.inputTokens,
        output: input.outputTokens,
        total: input.inputTokens + input.outputTokens,
      },
      costDetails: {
        totalCost: input.callCostUsd,
      },
      metadata: {
        runId: this.runId,
        traceId: this.traceId,
        latencyMs: input.latencyMs,
        callCostUsd: input.callCostUsd,
      },
    });
    generation.end();
  }

  recordLlmError(input: LlmCallTraceError): void {
    if (!this.root) return;

    const generation = this.root.startObservation(
      `llm-iteration-${input.iteration}`,
      {
        model: input.model,
        input: {
          system: input.system,
          messages: summarizeMessages(input.messages),
        },
        metadata: {
          runId: this.runId,
          traceId: this.traceId,
          iteration: input.iteration,
          latencyMs: input.latencyMs,
        },
      },
      { asType: "generation" },
    );

    generation.update({
      level: "ERROR",
      statusMessage: errorMessage(input.error),
      output: { error: errorMessage(input.error) },
      metadata: {
        runId: this.runId,
        traceId: this.traceId,
        latencyMs: input.latencyMs,
      },
    });
    generation.end();
  }

  recordToolCall(record: ToolCallTraceRecord): void {
    if (!this.root) return;

    const tool = this.root.startObservation(
      record.name,
      {
        input: {
          toolUseId: record.toolUseId,
          ...((record.input as object) ?? {}),
        },
        metadata: {
          runId: this.runId,
          traceId: this.traceId,
          iteration: record.iteration,
          latencyMs: record.latencyMs,
        },
      },
      { asType: "tool" },
    );

    tool.update({
      output: record.output,
      level: record.ok ? "DEFAULT" : "ERROR",
      statusMessage: record.ok ? undefined : record.output.slice(0, 500),
      metadata: {
        runId: this.runId,
        traceId: this.traceId,
        toolUseId: record.toolUseId,
        ok: record.ok,
        latencyMs: record.latencyMs,
      },
    });
    tool.end();
  }

  async finishRun(result: AgentRunTraceResult): Promise<void> {
    if (!this.root) return;

    this.root.update({
      output: {
        text: result.text,
        completed: result.completed,
        stopReason: result.stopReason,
        iterations: result.iterations,
        partialReason: result.partialReason,
      },
      metadata: {
        runId: this.runId,
        traceId: this.traceId,
        inputTokens: result.tokenUsage.inputTokens,
        outputTokens: result.tokenUsage.outputTokens,
        totalTokens: result.tokenUsage.totalTokens,
        totalCostUsd: result.costUsage.totalCostUsd,
        llmCallCount: result.costUsage.callCount,
      },
      level: result.completed ? "DEFAULT" : "WARNING",
      statusMessage: result.partialReason,
    });
    this.root.end();
    this.root = undefined;
    await flushLangfuseSpans();
  }
}

export function createAgentLangfuseTracer(
  options: AgentLangfuseTracerOptions = {},
): AgentLangfuseTracer {
  if (!isLangfuseConfigured()) {
    return new NoopAgentLangfuseTracer(options.runId);
  }
  return new LangfuseAgentTracer(options);
}

export function shouldEnableLangfuse(explicit?: boolean): boolean {
  if (explicit === false) return false;
  if (explicit === true) return isLangfuseConfigured();
  if (process.env.LANGFUSE_TRACING === "0") return false;
  return isLangfuseConfigured();
}
