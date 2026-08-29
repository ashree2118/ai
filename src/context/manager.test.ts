import assert from "node:assert/strict";
import test from "node:test";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  ContextManager,
  estimateMessageChars,
  groupTurns,
} from "./manager.js";

function toolTurn(step: number): MessageParam[] {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: `Step ${step} reasoning`,
        },
        {
          type: "tool_use",
          id: `toolu_${step}`,
          name: "read_file",
          input: { path: `file-${step}.ts` },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: `toolu_${step}`,
          content: `content-${step}`,
        },
      ],
    },
  ];
}

test("groupTurns keeps assistant and tool_result pairs together", () => {
  const messages: MessageParam[] = [
    { role: "user", content: "task" },
    ...toolTurn(1),
    ...toolTurn(2),
  ];

  const turns = groupTurns(messages);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]!.length, 2);
  assert.equal(turns[1]!.length, 2);
});

test("ContextManager keeps task and recent turns when history is large", () => {
  const manager = new ContextManager({
    maxMessageChars: 200,
    windowTurns: 1,
    maxSummaryChars: 500,
  });

  const messages: MessageParam[] = [
    { role: "user", content: "initial task" },
    ...toolTurn(1),
    ...toolTurn(2),
    ...toolTurn(3),
  ];

  const prepared = manager.prepare(messages);
  assert.equal(prepared.compressed, true);
  assert.equal(prepared.messages[0]?.content, "initial task");
  assert.equal(prepared.messages.length, 3);
  assert.match(manager.summary, /file-1\.ts/);
  assert.match(manager.summary, /file-2\.ts/);
  assert.doesNotMatch(manager.summary, /file-3\.ts/);
});

test("ContextManager accumulates rolling summary across compressions", () => {
  const manager = new ContextManager({
    maxMessageChars: 120,
    windowTurns: 1,
    maxSummaryChars: 1_000,
  });

  const first = manager.prepare([
    { role: "user", content: "task" },
    ...toolTurn(1),
    ...toolTurn(2),
  ]);
  const second = manager.prepare([
    { role: "user", content: "task" },
    ...first.messages.slice(1),
    ...toolTurn(3),
    ...toolTurn(4),
  ]);

  assert.equal(second.compressed, true);
  assert.match(manager.summary, /file-1\.ts/);
  assert.match(manager.summary, /file-2\.ts/);
  assert.match(manager.summary, /file-3\.ts/);
});

test("formatSummarySection renders rolling summary block", () => {
  const manager = new ContextManager({ maxMessageChars: 100, windowTurns: 1 });
  manager.prepare([
    { role: "user", content: "task" },
    ...toolTurn(1),
    ...toolTurn(2),
  ]);

  const section = manager.formatSummarySection();
  assert.match(section, /## Conversation Summary/);
  assert.match(section, /file-1\.ts/);
});

test("estimateMessageChars sums serialized message content", () => {
  const messages: MessageParam[] = [
    { role: "user", content: "abc" },
    { role: "assistant", content: "def" },
  ];
  assert.equal(estimateMessageChars(messages), 6);
});
