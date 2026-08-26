import assert from "node:assert/strict";
import test from "node:test";
import type {
  Message,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { extractText, extractToolUses } from "./react-agent.js";

test("extractText joins text blocks", () => {
  const content = [
    { type: "text", text: "hello " },
    { type: "text", text: "world" },
  ] as Message["content"];
  assert.equal(extractText(content), "hello world");
});

test("extractToolUses returns only tool_use blocks", () => {
  const toolUse: ToolUseBlock = {
    type: "tool_use",
    id: "toolu_1",
    name: "read_file",
    input: { path: "package.json" },
  };

  const content = [
    { type: "text", text: "checking file" },
    toolUse,
  ] as Message["content"];

  assert.deepEqual(extractToolUses(content), [toolUse]);
});
