import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { HitlGate } from "./hitl/gate.js";
import type { AgentTrace } from "./trace/agent-trace.js";
import { runTool } from "./tool-registry.js";

export type ExecuteToolsOptions = {
  iteration?: number;
  trace?: AgentTrace;
  hitl?: HitlGate;
};

export function toToolResult(
  toolUse: ToolUseBlock,
  output: string,
  isError = false,
): ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: toolUse.id,
    content: output,
    ...(isError ? { is_error: true } : {}),
  };
}

function dependencyIds(
  toolUse: ToolUseBlock,
  allIds: Set<string>,
): Set<string> {
  const inputText = JSON.stringify(toolUse.input ?? {});
  const dependsOn = new Set<string>();

  for (const id of allIds) {
    if (id !== toolUse.id && inputText.includes(id)) {
      dependsOn.add(id);
    }
  }

  return dependsOn;
}

//scans each tool's input for other tool_use_id references. Independent tools land in the same group; dependent ones wait for later groups.
export function groupToolUsesByDependency(
  toolUses: ToolUseBlock[],
): ToolUseBlock[][] {
  if (toolUses.length === 0) return [];

  const allIds = new Set(toolUses.map((toolUse) => toolUse.id));
  const deps = new Map(
    toolUses.map((toolUse) => [toolUse.id, dependencyIds(toolUse, allIds)]),
  );

  const groups: ToolUseBlock[][] = [];
  const done = new Set<string>();
  const remaining = [...toolUses];

  while (remaining.length > 0) {
    const ready = remaining.filter((toolUse) =>
      [...(deps.get(toolUse.id) ?? [])].every((id) => done.has(id)),
    );

    if (ready.length === 0) {
      const next = remaining.shift()!;
      groups.push([next]);
      done.add(next.id);
      continue;
    }

    groups.push(ready);

    for (const toolUse of ready) {
      done.add(toolUse.id);
      remaining.splice(remaining.indexOf(toolUse), 1);
    }
  }

  return groups;
}

async function runToolWithHitl(
  toolUse: ToolUseBlock,
  hitl?: HitlGate,
): Promise<string> {
  if (hitl) {
    await hitl.ensurePrApproved({ toolUse });
  }
  return runTool(toolUse.name, toolUse.input);
}

async function executeToolGroup(
  toolUses: ToolUseBlock[],
  options: ExecuteToolsOptions = {},
): Promise<ToolResultBlockParam[]> {
  const iteration = options.iteration ?? 0;

  for (const toolUse of toolUses) {
    options.trace?.recordToolCall({
      iteration,
      toolUseId: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    });
  }

  const settled = await Promise.allSettled(
    toolUses.map(async (toolUse) =>
      runToolWithHitl(toolUse, options.hitl),
    ),
  );

  return settled.map((result, index) => {
    const toolUse = toolUses[index]!;

    if (result.status === "fulfilled") {
      console.error(`tool ${toolUse.name} ok`);
      options.trace?.recordToolResult({
        iteration,
        toolUseId: toolUse.id,
        name: toolUse.name,
        ok: true,
        output: result.value,
      });
      return toToolResult(toolUse, result.value);
    }

    const message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    console.error(`tool ${toolUse.name} error: ${message}`);
    options.trace?.recordToolResult({
      iteration,
      toolUseId: toolUse.id,
      name: toolUse.name,
      ok: false,
      output: message,
    });
    return toToolResult(toolUse, message, true);
  });
}

export async function executeTools(
  toolUses: ToolUseBlock[],
  options: ExecuteToolsOptions = {},
): Promise<ToolResultBlockParam[]> {
  const groups = groupToolUsesByDependency(toolUses);
  const resultsById = new Map<string, ToolResultBlockParam>();

  for (const group of groups) {
    const groupResults = await executeToolGroup(group, options);
    for (const result of groupResults) {
      resultsById.set(result.tool_use_id, result);
    }
  }

  return toolUses.map((toolUse) => {
    const result = resultsById.get(toolUse.id);
    if (!result) {
      throw new Error(`missing tool result for ${toolUse.id}`);
    }
    return result;
  });
}
