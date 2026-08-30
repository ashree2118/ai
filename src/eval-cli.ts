#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  formatAgentEvalReport,
  runAgentEval,
} from "./eval/agent-runner.js";
import {
  formatEvalReport,
  runDatasetEvalPipeline,
  runEvalPipeline,
} from "./eval/runner.js";
import {
  getEvalIssue,
  loadEvalIssues,
  summarizeEvalDataset,
} from "./eval/dataset/loader.js";

function usage(): never {
  console.error(`Usage:
  eval-cli retrieval [--dataset] [--split train|test|all]
  eval-cli dataset [--id <eval-id>]
  eval-cli agent [--split train|test|all] [--id <eval-id>] [--artifacts-dir <dir>] [--skip-run] [--skip-judge] [--json-out <path>]

Commands:
  retrieval   Run retrieval Precision@K evaluation (default: legacy 10-issue corpus)
  dataset     Print the 20-issue agent eval dataset summary or one issue
  agent       Score agent fixes with file metrics, test pass rate, and LLM PR judge

Examples:
  eval-cli dataset
  eval-cli dataset --id eval-16
  eval-cli retrieval --dataset --split test
  eval-cli agent --split test --artifacts-dir traces/artifacts
  eval-cli agent --id eval-01 --skip-run`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  command: "retrieval" | "dataset" | "agent";
  split: "train" | "test" | "all";
  useDataset: boolean;
  id?: string;
  artifactsDir?: string;
  skipRun: boolean;
  skipJudge: boolean;
  jsonOut?: string;
} {
  const parts = [...argv];
  let command: "retrieval" | "dataset" | "agent" = "retrieval";
  let split: "train" | "test" | "all" = "all";
  let useDataset = false;
  let id: string | undefined;
  let artifactsDir: string | undefined;
  let skipRun = false;
  let skipJudge = false;
  let jsonOut: string | undefined;

  if (
    parts[0] === "retrieval" ||
    parts[0] === "dataset" ||
    parts[0] === "agent"
  ) {
    command = parts.shift() as "retrieval" | "dataset" | "agent";
  }

  for (let i = 0; i < parts.length; i++) {
    const arg = parts[i]!;
    if (arg === "--dataset") {
      useDataset = true;
      continue;
    }
    if (arg === "--split" && parts[i + 1]) {
      split = parts[++i] as "train" | "test" | "all";
      continue;
    }
    if (arg === "--id" && parts[i + 1]) {
      id = parts[++i];
      continue;
    }
    if (arg === "--artifacts-dir" && parts[i + 1]) {
      artifactsDir = parts[++i];
      continue;
    }
    if (arg === "--json-out" && parts[i + 1]) {
      jsonOut = parts[++i];
      continue;
    }
    if (arg === "--skip-run") {
      skipRun = true;
      continue;
    }
    if (arg === "--skip-judge") {
      skipJudge = true;
      continue;
    }
    usage();
  }

  if (!["train", "test", "all"].includes(split)) {
    throw new Error("--split must be train, test, or all");
  }

  return {
    command,
    split,
    useDataset,
    id,
    artifactsDir,
    skipRun,
    skipJudge,
    jsonOut,
  };
}

function printDatasetSummary(): void {
  const summary = summarizeEvalDataset();
  console.log("agent eval dataset");
  console.log(`total: ${summary.total}`);
  console.log(`train: ${summary.trainCount}`);
  console.log(`test: ${summary.testCount}`);
  console.log(`repositories: ${summary.repositories.join(", ")}`);
  console.log("");

  for (const issue of loadEvalIssues()) {
    console.log(`${issue.id} [${issue.split}] ${issue.title}`);
    console.log(
      `  repo: ${issue.repository.owner}/${issue.repository.repo}`,
    );
    console.log(`  files: ${issue.correctFiles.join(", ")}`);
    console.log(
      `  fix: ${issue.referenceFix.commit} ${issue.referenceFix.summary}`,
    );
    console.log("");
  }
}

function printDatasetIssue(id: string): void {
  const issue = getEvalIssue(id);
  if (!issue) {
    throw new Error(`unknown dataset issue: ${id}`);
  }

  console.log(`${issue.id} [${issue.split}] ${issue.title}`);
  console.log(`repository: ${issue.repository.owner}/${issue.repository.repo}`);
  console.log("");
  console.log(issue.issueText);
  console.log("");
  console.log(`correct files: ${issue.correctFiles.join(", ")}`);
  console.log(
    `reference fix: ${issue.referenceFix.commit} ${issue.referenceFix.summary}`,
  );
  console.log(`approach: ${issue.approach}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "dataset") {
    if (options.id) {
      printDatasetIssue(options.id);
      return;
    }
    printDatasetSummary();
    return;
  }

  if (options.command === "agent") {
    if (!options.skipJudge && !process.env.ANTHROPIC_API_KEY) {
      console.error("Error: ANTHROPIC_API_KEY is not set");
      process.exit(1);
    }

    const summary = await runAgentEval({
      split: options.split,
      ids: options.id ? [options.id] : undefined,
      artifactsDir: options.artifactsDir,
      skipRun: options.skipRun,
      skipJudge: options.skipJudge,
    });

    console.log(formatAgentEvalReport(summary));

    if (options.jsonOut) {
      const outputPath = resolve(options.jsonOut);
      await writeFile(outputPath, JSON.stringify(summary, null, 2), "utf8");
      console.error(`[agent-eval] wrote ${outputPath}`);
    }

    if (summary.failures.length > 0) {
      process.exit(1);
    }
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is not set");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY is not set");
    process.exit(1);
  }

  const summary = options.useDataset
    ? await runDatasetEvalPipeline(options.split)
    : await runEvalPipeline();

  console.log(formatEvalReport(summary));

  if (summary.failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
