#!/usr/bin/env node

import { exitCodeForAgentResult, printAgentResult } from "./agent-output.js";
import { ReactAgent } from "./react-agent.js";

function parseArgs(argv: string[]): { task: string; maxIterations?: number; maxTokenBudget?: number } {
  const parts: string[] = [];
  let maxIterations: number | undefined;
  let maxTokenBudget: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--max-iterations" && argv[i + 1]) {
      maxIterations = Number(argv[++i]);
      continue;
    }
    if (arg === "--max-token-budget" && argv[i + 1]) {
      maxTokenBudget = Number(argv[++i]);
      continue;
    }
    parts.push(arg);
  }

  const task = parts.join(" ").trim();
  if (!task) {
    console.error("Usage: agent <task> [--max-iterations N] [--max-token-budget N]");
    process.exit(1);
  }

  return { task, maxIterations, maxTokenBudget };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const { task, maxIterations, maxTokenBudget } = parseArgs(process.argv.slice(2));
  const agent = new ReactAgent({ maxIterations, maxTokenBudget });
  const result = await agent.run(task);
  printAgentResult(result);
  process.exit(exitCodeForAgentResult(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
