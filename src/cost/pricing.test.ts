import assert from "node:assert/strict";
import test from "node:test";
import {
  addCallCost,
  calculateCallCost,
  emptyCostTotals,
  exceedsCostBudget,
  formatCostUsage,
  loadModelPricingTable,
  partialReasonForCostBudget,
  resolveModelPricing,
} from "./pricing.js";

test("calculateCallCost uses per-million token pricing", () => {
  const cost = calculateCallCost("claude-sonnet-4-20250514", 1_000_000, 500_000, {
    "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
  });
  assert.equal(cost, 3 + 7.5);
});

test("resolveModelPricing falls back to _default", () => {
  const pricing = resolveModelPricing("unknown-model", {
    _default: { inputPerMillion: 1, outputPerMillion: 2 },
  });
  assert.deepEqual(pricing, { inputPerMillion: 1, outputPerMillion: 2 });
});

test("addCallCost accumulates per-run totals", () => {
  const first = addCallCost(emptyCostTotals(), {
    model: "claude-sonnet-4-20250514",
    inputTokens: 1000,
    outputTokens: 500,
    pricing: {
      "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
    },
  });

  assert.equal(first.totals.callCount, 1);
  assert.ok(first.totals.totalCostUsd > 0);

  const second = addCallCost(first.totals, {
    model: "claude-sonnet-4-20250514",
    inputTokens: 2000,
    outputTokens: 1000,
    pricing: {
      "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
    },
  });

  assert.equal(second.totals.callCount, 2);
  assert.equal(
    second.totals.totalCostUsd,
    first.totals.totalCostUsd + second.callCostUsd,
  );
});

test("exceedsCostBudget respects optional budget", () => {
  const totals = { inputTokens: 1, outputTokens: 1, totalCostUsd: 0.5, callCount: 1 };
  assert.equal(exceedsCostBudget(totals, undefined), false);
  assert.equal(exceedsCostBudget(totals, 1), false);
  assert.equal(exceedsCostBudget(totals, 0.5), true);
});

test("loadModelPricingTable merges env overrides", () => {
  const previous = process.env.MODEL_PRICING_JSON;
  process.env.MODEL_PRICING_JSON = JSON.stringify({
    "custom-model": { inputPerMillion: 9, outputPerMillion: 9 },
  });

  try {
    const table = loadModelPricingTable();
    assert.equal(table["custom-model"]?.inputPerMillion, 9);
    assert.ok(table["claude-sonnet-4-20250514"]);
  } finally {
    if (previous) {
      process.env.MODEL_PRICING_JSON = previous;
    } else {
      delete process.env.MODEL_PRICING_JSON;
    }
  }
});

test("partialReasonForCostBudget and formatCostUsage are explicit", () => {
  const totals = {
    inputTokens: 100,
    outputTokens: 50,
    totalCostUsd: 1.25,
    callCount: 2,
  };

  assert.match(partialReasonForCostBudget(totals, 1), /cost budget exceeded/);
  assert.match(formatCostUsage(totals), /\$1\.250000/);
});
