import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";

const MAX_TOOL_OUTPUT_CHARS = 240;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function summarizeToolResult(content: string | unknown): string {
  const text =
    typeof content === "string" ? content : JSON.stringify(content ?? "");
  const oneLine = text.replace(/\s+/g, " ").trim();
  return truncate(oneLine, MAX_TOOL_OUTPUT_CHARS);
}

export function formatToolHistory(messages: readonly MessageParam[]): string {
  const lines: string[] = [];
  let step = 0;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;

    const toolUses = message.content.filter(
      (block) => block.type === "tool_use",
    );
    if (toolUses.length === 0) continue;

    const next = messages[index + 1];
    const results =
      next?.role === "user" && Array.isArray(next.content)
        ? next.content.filter((block) => block.type === "tool_result")
        : [];

    for (const toolUse of toolUses) {
      step += 1;
      const result = results.find(
        (block) => block.tool_use_id === toolUse.id,
      );
      const status = result?.is_error ? "error" : "ok";
      const output = result
        ? summarizeToolResult(result.content ?? "")
        : "(no result)";
      lines.push(
        `${step}. ${toolUse.name}(${JSON.stringify(toolUse.input)}) -> ${status}: ${output}`,
      );
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(none yet)";
}
