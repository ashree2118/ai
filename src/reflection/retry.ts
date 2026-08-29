import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";

export type ToolFailure = {
  signature: string;
  tool: string;
  input: unknown;
  error: string;
  attempts: number;
};

const DEFAULT_MAX_RETRIES = 3;

function readMaxRetries(option?: number): number {
  if (option !== undefined) return option;
  const fromEnv = process.env.REACT_MAX_RETRIES;
  if (!fromEnv) return DEFAULT_MAX_RETRIES;
  return Number(fromEnv);
}

export function toolSignature(name: string, input: unknown): string {
  return `${name}:${JSON.stringify(input ?? {})}`;
}

export class RetryPolicy {
  private readonly maxRetries: number;
  private readonly counts = new Map<string, number>();
  private recentFailures: ToolFailure[] = [];

  constructor(maxRetries?: number) {
    this.maxRetries = readMaxRetries(maxRetries);
  }

  get maxAttempts(): number {
    return this.maxRetries;
  }

  get recent(): readonly ToolFailure[] {
    return this.recentFailures;
  }

  check(toolUse: Pick<ToolUseBlock, "name" | "input">): {
    allowed: boolean;
    message?: string;
  } {
    const signature = toolSignature(toolUse.name, toolUse.input);
    const priorFailures = this.counts.get(signature) ?? 0;

    if (priorFailures >= this.maxRetries) {
      return {
        allowed: false,
        message: [
          `Retry blocked for ${toolUse.name}: same input failed ${priorFailures} time(s).`,
          "Analyze the prior error, revise your approach, and avoid repeating this exact tool call.",
        ].join(" "),
      };
    }

    return { allowed: true };
  }

  recordBatch(
    toolUses: ToolUseBlock[],
    results: ToolResultBlockParam[],
  ): void {
    this.recentFailures = [];

    for (const toolUse of toolUses) {
      const result = results.find((item) => item.tool_use_id === toolUse.id);
      if (!result?.is_error) continue;

      const signature = toolSignature(toolUse.name, toolUse.input);
      const attempts = (this.counts.get(signature) ?? 0) + 1;
      this.counts.set(signature, attempts);

      this.recentFailures.push({
        signature,
        tool: toolUse.name,
        input: toolUse.input,
        error:
          typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content ?? ""),
        attempts,
      });
    }
  }

  formatReflectionSection(): string {
    if (this.recentFailures.length === 0) {
      return "## Reflection\n(none yet)";
    }

    const lines = [
      "## Reflection",
      "Recent tool/test failures. Analyze the error and choose a different approach.",
      "",
      ...this.recentFailures.map((failure) => {
        const input = JSON.stringify(failure.input);
        return `- ${failure.tool} (attempt ${failure.attempts}/${this.maxRetries}) input=${input} error=${failure.error}`;
      }),
      "",
      "Do not repeat the same failing tool call without changing inputs or strategy.",
    ];

    return lines.join("\n");
  }
}

export function partitionToolUses(
  toolUses: ToolUseBlock[],
  policy?: RetryPolicy,
): {
  allowed: ToolUseBlock[];
  blocked: ToolResultBlockParam[];
} {
  if (!policy) {
    return { allowed: toolUses, blocked: [] };
  }

  const allowed: ToolUseBlock[] = [];
  const blocked: ToolResultBlockParam[] = [];

  for (const toolUse of toolUses) {
    const decision = policy.check(toolUse);
    if (decision.allowed) {
      allowed.push(toolUse);
      continue;
    }

    blocked.push({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: decision.message ?? "Retry blocked.",
      is_error: true,
    });
  }

  return { allowed, blocked };
}

export function mergeToolResults(
  toolUses: ToolUseBlock[],
  executed: ToolResultBlockParam[],
  blocked: ToolResultBlockParam[],
): ToolResultBlockParam[] {
  const byId = new Map<string, ToolResultBlockParam>();
  for (const result of [...executed, ...blocked]) {
    byId.set(result.tool_use_id, result);
  }

  return toolUses.map((toolUse) => {
    const result = byId.get(toolUse.id);
    if (!result) {
      throw new Error(`missing tool result for ${toolUse.id}`);
    }
    return result;
  });
}
