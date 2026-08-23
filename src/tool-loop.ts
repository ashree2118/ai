import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { runTool } from "./tool-registry.js";

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

function toToolResult(
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

async function executeToolGroup(
  toolUses: ToolUseBlock[],
): Promise<ToolResultBlockParam[]> {
  const settled = await Promise.allSettled(
    toolUses.map(async (toolUse) => runTool(toolUse.name, toolUse.input)),
  );

  return settled.map((result, index) => {
    const toolUse = toolUses[index]!;

    if (result.status === "fulfilled") {
      console.error(`tool ${toolUse.name} ok`);
      return toToolResult(toolUse, result.value);
    }

    const message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    console.error(`tool ${toolUse.name} error: ${message}`);
    return toToolResult(toolUse, message, true);
  });
}

export async function executeTools(
  toolUses: ToolUseBlock[],
): Promise<ToolResultBlockParam[]> {
  const groups = groupToolUsesByDependency(toolUses);
  const resultsById = new Map<string, ToolResultBlockParam>();

  for (const group of groups) {
    const groupResults = await executeToolGroup(group);
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
