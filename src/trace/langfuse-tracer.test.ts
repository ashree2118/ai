import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentLangfuseTracer,
  NoopAgentLangfuseTracer,
  shouldEnableLangfuse,
} from "./langfuse-tracer.js";
import { isLangfuseConfigured } from "./langfuse-setup.js";

test("NoopAgentLangfuseTracer is disabled and records nothing", async () => {
  const tracer = new NoopAgentLangfuseTracer("run-123");
  assert.equal(tracer.enabled, false);
  assert.equal(tracer.runId, "run-123");
  assert.equal(tracer.traceId, null);

  tracer.startRun({ task: "demo", model: "claude" });
  tracer.recordLlmCall({
    iteration: 1,
    model: "claude",
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    stopReason: "end_turn",
    assistantText: "hello",
    toolCalls: [],
    inputTokens: 1,
    outputTokens: 2,
    latencyMs: 10,
  });
  tracer.recordToolCall({
    iteration: 1,
    toolUseId: "tool-1",
    name: "read_file",
    input: { path: "a.ts" },
    ok: true,
    output: "ok",
    latencyMs: 5,
  });
  await tracer.finishRun({
    text: "done",
    iterations: 1,
    stopReason: "end_turn",
    tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    completed: true,
  });
});

test("createAgentLangfuseTracer returns noop without credentials", () => {
  const previousPublic = process.env.LANGFUSE_PUBLIC_KEY;
  const previousSecret = process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;

  try {
    const tracer = createAgentLangfuseTracer({ runId: "offline-run" });
    assert.equal(tracer.enabled, false);
    assert.equal(tracer.runId, "offline-run");
    assert.equal(isLangfuseConfigured(), false);
    assert.equal(shouldEnableLangfuse(), false);
  } finally {
    if (previousPublic) process.env.LANGFUSE_PUBLIC_KEY = previousPublic;
    if (previousSecret) process.env.LANGFUSE_SECRET_KEY = previousSecret;
  }
});

test("shouldEnableLangfuse respects explicit opt-out", () => {
  assert.equal(shouldEnableLangfuse(false), false);
});
