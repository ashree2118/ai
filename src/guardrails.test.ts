import assert from "node:assert/strict";
import test from "node:test";
import {
  addUsage,
  emptyTokenUsage,
  exceedsTokenBudget,
  partialReasonForIterations,
  partialReasonForTokenBudget,
} from "./guardrails.js";

test("addUsage accumulates input, output, and total tokens", () => {
  const totals = addUsage(emptyTokenUsage(), {
    input_tokens: 100,
    output_tokens: 40,
  });

  assert.deepEqual(totals, {
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
  });

  const next = addUsage(totals, {
    input_tokens: 20,
    output_tokens: 10,
  });

  assert.equal(next.totalTokens, 170);
  assert.equal(next.inputTokens, 120);
  assert.equal(next.outputTokens, 50);
});

test("exceedsTokenBudget respects optional budget", () => {
  const totals = { inputTokens: 80, outputTokens: 30, totalTokens: 110 };
  assert.equal(exceedsTokenBudget(totals, undefined), false);
  assert.equal(exceedsTokenBudget(totals, 200), false);
  assert.equal(exceedsTokenBudget(totals, 110), true);
});

test("partial reasons are explicit", () => {
  assert.match(
    partialReasonForIterations(20, 20),
    /iteration limit reached/,
  );
  assert.match(
    partialReasonForTokenBudget(
      { inputTokens: 900, outputTokens: 200, totalTokens: 1100 },
      1000,
    ),
    /token budget exceeded/,
  );
});
