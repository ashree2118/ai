#!/usr/bin/env node

import { exitCodeForAgentResult, printAgentResult } from "./agent-output.js";
import { ensureGithubMcp } from "./mcp/connect.js";
import { runReactAgent } from "./react-agent.js";

function parseArgs(argv: string[]): {
  task: string;
  maxIterations?: number;
  maxTokenBudget?: number;
  githubMcp?: boolean;
  hitl?: boolean;
} {
  const parts: string[] = [];
  let maxIterations: number | undefined;
  let maxTokenBudget: number | undefined;
  let githubMcp = false;
  let hitl = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--github-mcp") {
      githubMcp = true;
      continue;
    }
    if (arg === "--hitl") {
      hitl = true;
      continue;
    }
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
    console.error("Usage: react-agent <task> [--max-iterations N] [--max-token-budget N] [--github-mcp] [--hitl]");
    process.exit(1);
  }

  return { task, maxIterations, maxTokenBudget, githubMcp, hitl };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const { task, maxIterations, maxTokenBudget, githubMcp, hitl } = parseArgs(
    process.argv.slice(2),
  );
  await ensureGithubMcp(githubMcp);
  const result = await runReactAgent(task, {
    maxIterations,
    maxTokenBudget,
    enableHitl: hitl,
  });
  printAgentResult(result);
  process.exit(exitCodeForAgentResult(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
