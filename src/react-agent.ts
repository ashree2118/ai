import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
  Usage,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { executeTools } from "./tool-loop.js";
import { TOOLS } from "./tool-registry.js";

export const DEFAULT_REACT_SYSTEM_PROMPT = `You are a ReAct coding agent. Reason about the task, call tools when needed, observe tool results, and continue until you can give a final answer.

Available workspace tools: list_files, read_file, run_command.
Available GitHub tools: github_get_issue, github_list_files, github_read_file, github_create_branch, github_write_file, github_create_pr.

Use workspace tools for local files and shell commands. Use GitHub tools for remote repository work. GitHub tools require GITHUB_TOKEN and can default owner/repo from GITHUB_OWNER and GITHUB_REPO.`;

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export type ReactAgentOptions = {
  system?: string;
  model?: string;
  maxTokens?: number;
  maxIterations?: number;
  tools?: Tool[];
  client?: Anthropic;
  log?: (message: string) => void;
};

export type ReactAgentResult = {
  text: string;
  iterations: number;
  stopReason: string;
  usage: Usage;
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
  private readonly system: string;
  private readonly tools: Tool[];
  private readonly log: (message: string) => void;
  private messages: MessageParam[] = [];

  constructor(options: ReactAgentOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 4096;
    this.maxIterations = options.maxIterations ?? 20;
    this.system = options.system ?? DEFAULT_REACT_SYSTEM_PROMPT;
    this.tools = options.tools ?? TOOLS;
    this.log = options.log ?? ((message) => console.error(message));
  }

  get history(): readonly MessageParam[] {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
  }

  async run(task: string): Promise<ReactAgentResult> {
    this.messages.push({ role: "user", content: task });

    let lastUsage!: Usage;
    let stopReason = "max_iterations";
    let finalText = "";

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      this.log(`[react] iteration ${iteration}`);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.system,
        tools: this.tools,
        messages: this.messages,
      });

      lastUsage = response.usage;
      stopReason = response.stop_reason ?? "unknown";
      this.messages.push({ role: "assistant", content: response.content });

      this.log(
        `[react] llm stop_reason=${stopReason} input=${response.usage.input_tokens} output=${response.usage.output_tokens}`,
      );

      if (response.stop_reason !== "tool_use") {
        finalText = extractText(response.content);
        this.log(`[react] final response after ${iteration} iteration(s)`);
        return {
          text: finalText,
          iterations: iteration,
          stopReason,
          usage: lastUsage,
          messages: this.messages,
        };
      }

      const toolUses = extractToolUses(response.content);
      this.log(
        `[react] tools requested (${toolUses.length}): ${toolUses.map((tool) => tool.name).join(", ")}`,
      );

      const toolResults = await executeTools(toolUses);
      this.messages.push({ role: "user", content: toolResults });
      this.log(`[react] tool_result sent for ${toolResults.length} tool call(s)`);
    }

    throw new Error(`[react] stopped after ${this.maxIterations} iterations`);
  }
}

export async function runReactAgent(
  task: string,
  options: ReactAgentOptions = {},
): Promise<ReactAgentResult> {
  const agent = new ReactAgent(options);
  return agent.run(task);
}
