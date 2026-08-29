import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages/messages";

export type CheckpointKind = "plan" | "pr_creation";

export type ApprovalDecision = "approved" | "rejected";

export type CheckpointRequest = {
  kind: CheckpointKind;
  title: string;
  summary: string;
  details: string;
  pendingTools?: string[];
  toolUse?: Pick<ToolUseBlock, "name" | "input">;
};

export type ApprovalHandler = (
  request: CheckpointRequest,
) => Promise<ApprovalDecision>;

export type PlanCheckpointContext = {
  assistantText: string;
  plan: string[];
  pendingTools: string[];
};

export type PrCheckpointContext = {
  toolUse: Pick<ToolUseBlock, "name" | "input">;
};

export function isPrCreationTool(toolName: string): boolean {
  return toolName === "github_create_pr";
}

export function formatCheckpointPrompt(request: CheckpointRequest): string {
  const lines = [
    "",
    `[hitl] ${request.title}`,
    request.summary,
    "",
    request.details,
  ];

  if (request.pendingTools && request.pendingTools.length > 0) {
    lines.push("", "Pending tools:", ...request.pendingTools.map((tool) => `- ${tool}`));
  }

  if (request.toolUse) {
    lines.push(
      "",
      `Tool: ${request.toolUse.name}`,
      `Input: ${JSON.stringify(request.toolUse.input, null, 2)}`,
    );
  }

  lines.push("", "Approve? [y/N]");
  return lines.join("\n");
}
