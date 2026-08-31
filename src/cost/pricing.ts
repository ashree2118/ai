export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

export type ModelPricingTable = Record<string, ModelPricing>;

export type CostTotals = {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  callCount: number;
};

export const DEFAULT_MODEL_PRICING: ModelPricingTable = {
  "claude-sonnet-4-20250514": {
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  "claude-3-5-sonnet-20241022": {
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  "claude-3-5-haiku-20241022": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
  },
  _default: {
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
};

export function emptyCostTotals(): CostTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    callCount: 0,
  };
}

export function loadModelPricingTable(
  overrides?: ModelPricingTable,
): ModelPricingTable {
  let table: ModelPricingTable = { ...DEFAULT_MODEL_PRICING };

  if (process.env.MODEL_PRICING_JSON) {
    table = {
      ...table,
      ...(JSON.parse(process.env.MODEL_PRICING_JSON) as ModelPricingTable),
    };
  }

  if (overrides) {
    table = { ...table, ...overrides };
  }

  return table;
}

export function resolveModelPricing(
  model: string,
  table: ModelPricingTable,
): ModelPricing {
  return table[model] ?? table._default ?? { inputPerMillion: 0, outputPerMillion: 0 };
}

export function calculateCallCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  table: ModelPricingTable = DEFAULT_MODEL_PRICING,
): number {
  const pricing = resolveModelPricing(model, table);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

export function addCallCost(
  totals: CostTotals,
  input: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    pricing?: ModelPricingTable;
  },
): { totals: CostTotals; callCostUsd: number } {
  const callCostUsd = calculateCallCost(
    input.model,
    input.inputTokens,
    input.outputTokens,
    input.pricing,
  );

  return {
    callCostUsd,
    totals: {
      inputTokens: totals.inputTokens + input.inputTokens,
      outputTokens: totals.outputTokens + input.outputTokens,
      totalCostUsd: totals.totalCostUsd + callCostUsd,
      callCount: totals.callCount + 1,
    },
  };
}

export function exceedsCostBudget(
  totals: CostTotals,
  maxCostBudgetUsd?: number,
): boolean {
  if (maxCostBudgetUsd === undefined) return false;
  return totals.totalCostUsd >= maxCostBudgetUsd;
}

export function partialReasonForCostBudget(
  totals: CostTotals,
  maxCostBudgetUsd: number,
): string {
  return `Partial result: cost budget exceeded ($${totals.totalCostUsd.toFixed(6)}/$${maxCostBudgetUsd.toFixed(6)}; input_tokens=${totals.inputTokens}, output_tokens=${totals.outputTokens}).`;
}

export function formatCostUsage(totals: CostTotals): string {
  return `cost total=$${totals.totalCostUsd.toFixed(6)} calls=${totals.callCount} input_tokens=${totals.inputTokens} output_tokens=${totals.outputTokens}`;
}
