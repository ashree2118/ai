#!/usr/bin/env node

import { exitCodeForAgentResult, printAgentResult } from "./agent-output.js";
import { buildUserTask, createContextBuilder } from "./context/gather.js";
import { ReactAgent } from "./react-agent.js";

type CliOptions = {
  task: string;
  issueNumber?: number;
  issueText?: string;
  ragTopK: number;
  maxIterations?: number;
  maxTokenBudget?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const parts: string[] = [];
  let issueNumber: number | undefined;
  let issueText: string | undefined;
  let ragTopK = 5;
  let maxIterations: number | undefined;
  let maxTokenBudget: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--issue" && argv[i + 1]) {
      issueNumber = Number(argv[++i]);
      continue;
    }
    if (arg === "--issue-text" && argv[i + 1]) {
      issueText = argv[++i];
      continue;
    }
    if (arg === "--rag-top" && argv[i + 1]) {
      ragTopK = Number(argv[++i]);
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
    console.error(`Usage:
  context-agent <task> [--issue <number>] [--issue-text "..."] [--rag-top <k>]
                     [--max-iterations N] [--max-token-budget N]

Environment:
  ANTHROPIC_API_KEY        Required
  DATABASE_URL             Optional, for RAG retrieval
  GITHUB_TOKEN             Optional, when using --issue
  REACT_MAX_ITERATIONS     Optional default iteration limit
  REACT_MAX_TOKEN_BUDGET   Optional default token budget`);
    process.exit(1);
  }

  if (
    issueNumber !== undefined &&
    (!Number.isInteger(issueNumber) || issueNumber < 1)
  ) {
    throw new Error("--issue must be a positive integer");
  }
  if (!Number.isInteger(ragTopK) || ragTopK < 1) {
    throw new Error("--rag-top must be a positive integer");
  }

  return { task, issueNumber, issueText, ragTopK, maxIterations, maxTokenBudget };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const options = parseArgs(process.argv.slice(2));
  const contextBuilder = await createContextBuilder({
    task: options.task,
    issueNumber: options.issueNumber,
    issueText: options.issueText,
    ragTopK: options.ragTopK,
  });

  const agent = new ReactAgent({
    dynamicSystem: (messages) => contextBuilder.buildSystem(messages),
    maxIterations: options.maxIterations,
    maxTokenBudget: options.maxTokenBudget,
    enableScratchpad: true,
    log: (message) => console.error(message),
  });

  console.error("[context] injected system sections: instructions, issue, repo, rag, tool-history");
  const result = await agent.run(buildUserTask(options.task));
  printAgentResult(result);
  process.exit(exitCodeForAgentResult(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
