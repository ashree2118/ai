import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
  Usage,
} from "@anthropic-ai/sdk/resources/messages/messages";
import {
  addUsage,
  emptyTokenUsage,
  exceedsTokenBudget,
  formatTokenUsage,
  partialReasonForIterations,
  partialReasonForTokenBudget,
  type TokenUsageTotals,
} from "./guardrails.js";
import { executeTools } from "./tool-loop.js";
import { ContextManager } from "./context/manager.js";
import { ScratchpadMemory } from "./memory/scratchpad.js";
import { TOOLS } from "./tool-registry.js";
import type { AgentTrace } from "./trace/agent-trace.js";

export const DEFAULT_REACT_SYSTEM_PROMPT = `You are a ReAct coding agent. Reason about the task, call tools when needed, observe tool results, and continue until you can give a final answer.

Available workspace tools: list_files, read_file, run_command.
Available GitHub tools: github_get_issue, github_list_files, github_read_file, github_create_branch, github_write_file, github_create_pr.

Use workspace tools for local files and shell commands. Use GitHub tools for remote repository work. GitHub tools require GITHUB_TOKEN and can default owner/repo from GITHUB_OWNER and GITHUB_REPO.`;

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_ITERATIONS = 20;

function readMaxIterations(option?: number): number {
  if (option !== undefined) return option;
  const fromEnv = process.env.REACT_MAX_ITERATIONS;
  if (fromEnv) return Number(fromEnv);
  return DEFAULT_MAX_ITERATIONS;
}

function readMaxTokenBudget(option?: number): number | undefined {
  if (option !== undefined) return option;
  const fromEnv = process.env.REACT_MAX_TOKEN_BUDGET;
  if (!fromEnv) return undefined;
  return Number(fromEnv);
}

export type ReactAgentOptions = {
  system?: string;
  dynamicSystem?: (messages: readonly MessageParam[]) => string;
  model?: string;
  maxTokens?: number;
  maxIterations?: number;
  maxTokenBudget?: number;
  tools?: Tool[];
  client?: Anthropic;
  log?: (message: string) => void;
  trace?: AgentTrace;
  scratchpad?: ScratchpadMemory;
  enableScratchpad?: boolean;
  contextManager?: ContextManager;
  enableContextManagement?: boolean;
};

export type ReactAgentResult = {
  text: string;
  iterations: number;
  stopReason: string;
  usage: Usage;
  tokenUsage: TokenUsageTotals;
  completed: boolean;
  partialReason?: string;
  messages: MessageParam[];
};

export function extractText(content: Message["content"]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function extractToolUses(content: Message["content"]): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  );
}

export class ReactAgent {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly maxIterations: number;
  private readonly maxTokenBudget?: number;
  private readonly system: string;
  private readonly dynamicSystem?: (messages: readonly MessageParam[]) => string;
  private readonly tools: Tool[];
  private readonly log: (message: string) => void;
  private readonly trace?: AgentTrace;
  private readonly scratchpad?: ScratchpadMemory;
  private readonly contextManager?: ContextManager;
  private messages: MessageParam[] = [];

  constructor(options: ReactAgentOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 4096;
    this.maxIterations = readMaxIterations(options.maxIterations);
    this.maxTokenBudget = readMaxTokenBudget(options.maxTokenBudget);
    this.system = options.system ?? DEFAULT_REACT_SYSTEM_PROMPT;
    this.dynamicSystem = options.dynamicSystem;
    this.tools = options.tools ?? TOOLS;
    this.log = options.log ?? ((message) => console.error(message));
    this.trace = options.trace;
    this.scratchpad =
      options.scratchpad ??
      (options.enableScratchpad ? new ScratchpadMemory() : undefined);
    this.contextManager =
      options.contextManager ??
      (options.enableContextManagement ? new ContextManager() : undefined);
  }

  get contextSummary(): string | undefined {
    return this.contextManager?.summary;
  }

  get scratchpadState() {
    return this.scratchpad?.snapshot;
  }

  get history(): readonly MessageParam[] {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
    this.contextManager?.reset();
  }

  private resolveSystem(messages: readonly MessageParam[]): string {
    const parts = [this.dynamicSystem?.(messages) ?? this.system];
    if (this.contextManager) {
      parts.push(this.contextManager.formatSummarySection());
    }
    if (this.scratchpad) {
      parts.push(this.scratchpad.format());
    }
    return parts.join("\n\n");
  }

  private prepareApiContext(): MessageParam[] {
    if (!this.contextManager) return this.messages;
    const prepared = this.contextManager.prepare(this.messages);
    if (prepared.compressed) {
      this.log(
        `[context] compressed history to ${prepared.messages.length} message(s); summary ${this.contextManager.summary.length} chars`,
      );
    }
    return prepared.messages;
  }

  private buildPartialResult(input: {
    text: string;
    iterations: number;
    stopReason: string;
    usage: Usage;
    tokenUsage: TokenUsageTotals;
    partialReason: string;
  }): ReactAgentResult {
    this.log(`[guardrails] ${input.partialReason}`);
    this.log(`[guardrails] ${formatTokenUsage(input.tokenUsage)}`);

    const result = {
      text: input.text,
      iterations: input.iterations,
      stopReason: input.stopReason,
      usage: input.usage,
      tokenUsage: input.tokenUsage,
      completed: false,
      partialReason: input.partialReason,
      messages: this.messages,
    };
    this.trace?.finish(result);
    return result;
  }

  async run(task: string): Promise<ReactAgentResult> {
    this.scratchpad?.setGoal(task);
    this.messages.push({ role: "user", content: task });

    let lastUsage!: Usage;
    let tokenUsage = emptyTokenUsage();
    let lastAssistantText = "";

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (exceedsTokenBudget(tokenUsage, this.maxTokenBudget)) {
        return this.buildPartialResult({
          text: lastAssistantText,
          iterations: iteration - 1,
          stopReason: "max_token_budget",
          usage: lastUsage,
          tokenUsage,
          partialReason: partialReasonForTokenBudget(
            tokenUsage,
            this.maxTokenBudget!,
          ),
        });
      }

      this.trace?.startIteration(iteration);
      this.log(`[react] iteration ${iteration}/${this.maxIterations}`);

      const apiMessages = this.prepareApiContext();

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.resolveSystem(apiMessages),
        tools: this.tools,
        messages: apiMessages,
      });

      lastUsage = response.usage;
      tokenUsage = addUsage(tokenUsage, response.usage);
      const stopReason = response.stop_reason ?? "unknown";
      lastAssistantText = extractText(response.content);
      this.messages.push({ role: "assistant", content: response.content });

      this.trace?.recordLlmResponse({
        assistantText: lastAssistantText,
        stopReason,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cumulativeTokens: tokenUsage,
      });

      this.log(
        `[react] llm stop_reason=${stopReason} ${formatTokenUsage(tokenUsage)}`,
      );

      if (exceedsTokenBudget(tokenUsage, this.maxTokenBudget)) {
        return this.buildPartialResult({
          text: lastAssistantText,
          iterations: iteration,
          stopReason: "max_token_budget",
          usage: lastUsage,
          tokenUsage,
          partialReason: partialReasonForTokenBudget(
            tokenUsage,
            this.maxTokenBudget!,
          ),
        });
      }

      if (response.stop_reason !== "tool_use") {
        this.log(`[react] final response after ${iteration} iteration(s)`);
        const finalResult = {
          text: lastAssistantText,
          iterations: iteration,
          stopReason,
          usage: lastUsage,
          tokenUsage,
          completed: true,
          messages: this.messages,
        };
        this.trace?.finish(finalResult);
        return finalResult;
      }

      const toolUses = extractToolUses(response.content);
      this.log(
        `[react] tools requested (${toolUses.length}): ${toolUses.map((tool) => tool.name).join(", ")}`,
      );

      const toolResults = await executeTools(toolUses, {
        iteration,
        trace: this.trace,
      });
      this.scratchpad?.recordToolBatch(toolUses, toolResults);
      this.messages.push({ role: "user", content: toolResults });
      this.log(`[react] tool_result sent for ${toolResults.length} tool call(s)`);
    }

    return this.buildPartialResult({
      text: lastAssistantText,
      iterations: this.maxIterations,
      stopReason: "max_iterations",
      usage: lastUsage,
      tokenUsage,
      partialReason: partialReasonForIterations(
        this.maxIterations,
        this.maxIterations,
      ),
    });
  }
}

export async function runReactAgent(
  task: string,
  options: ReactAgentOptions = {},
): Promise<ReactAgentResult> {
  const agent = new ReactAgent(options);
  return agent.run(task);
}
