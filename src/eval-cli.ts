#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runBenchmark } from "./eval/benchmark.js";
import {
  formatAgentEvalReport,
  runAgentEval,
} from "./eval/agent-runner.js";
import { formatFailureReport } from "./eval/failure-analysis.js";
import { loadLatestRun } from "./eval/regression.js";
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
  eval-cli benchmark [--split train|test|all] [--artifacts-dir <dir>] [--results-dir <dir>] [--skip-retrieval] [--skip-agent] [--skip-judge] [--no-store]
  eval-cli failures [--results-dir <dir>]
  eval-cli retrieval [--dataset] [--split train|test|all]
  eval-cli dataset [--id <eval-id>]
  eval-cli agent [--split train|test|all] [--id <eval-id>] [--artifacts-dir <dir>] [--skip-run] [--skip-judge] [--json-out <path>]

Commands:
  benchmark   Run full eval benchmark, store versioned results, compare to previous (default for npm run eval)
  failures    Show failure analysis from the latest stored benchmark run
  retrieval   Run retrieval Precision@K evaluation (default: legacy 10-issue corpus)
  dataset     Print the 20-issue agent eval dataset summary or one issue
  agent       Score agent fixes with file metrics, test pass rate, and LLM PR judge

Examples:
  eval-cli benchmark
  eval-cli benchmark --split test --artifacts-dir eval-artifacts
  eval-cli dataset --id eval-16
  eval-cli retrieval --dataset --split test
  eval-cli agent --split test --artifacts-dir traces/artifacts`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  command: "benchmark" | "failures" | "retrieval" | "dataset" | "agent";
  split: "train" | "test" | "all";
  useDataset: boolean;
  id?: string;
  artifactsDir?: string;
  resultsDir?: string;
  skipRun: boolean;
  skipJudge: boolean;
  skipRetrieval: boolean;
  skipAgent: boolean;
  skipStore: boolean;
  jsonOut?: string;
} {
  const parts = [...argv];
  let command: "benchmark" | "failures" | "retrieval" | "dataset" | "agent" = "benchmark";
  let split: "train" | "test" | "all" = "test";
  let useDataset = false;
  let id: string | undefined;
  let artifactsDir: string | undefined;
  let resultsDir: string | undefined;
  let skipRun = false;
  let skipJudge = false;
  let skipRetrieval = false;
  let skipAgent = false;
  let skipStore = false;
  let jsonOut: string | undefined;

  if (
    parts[0] === "benchmark" ||
    parts[0] === "failures" ||
    parts[0] === "retrieval" ||
    parts[0] === "dataset" ||
    parts[0] === "agent"
  ) {
    command = parts.shift() as "benchmark" | "failures" | "retrieval" | "dataset" | "agent";
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
    if (arg === "--results-dir" && parts[i + 1]) {
      resultsDir = parts[++i];
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
    if (arg === "--skip-retrieval") {
      skipRetrieval = true;
      continue;
    }
    if (arg === "--skip-agent") {
      skipAgent = true;
      continue;
    }
    if (arg === "--no-store") {
      skipStore = true;
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
    resultsDir,
    skipRun,
    skipJudge,
    skipRetrieval,
    skipAgent,
    skipStore,
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

  if (options.command === "failures") {
    const resultsDir = resolve(options.resultsDir ?? "eval-results");
    const latest = await loadLatestRun(resultsDir);
    if (!latest?.failureAnalysis) {
      throw new Error(`no failure analysis found in ${resultsDir}/latest.json`);
    }
    console.log(formatFailureReport(latest.failureAnalysis));
    return;
  }

  if (options.command === "benchmark") {
    if (!options.skipRetrieval) {
      if (!process.env.DATABASE_URL) {
        console.error("Error: DATABASE_URL is not set (or pass --skip-retrieval)");
        process.exit(1);
      }
      if (!process.env.OPENAI_API_KEY) {
        console.error("Error: OPENAI_API_KEY is not set (or pass --skip-retrieval)");
        process.exit(1);
      }
    }

    if (!options.skipAgent && !options.skipJudge && !process.env.ANTHROPIC_API_KEY) {
      console.error("Error: ANTHROPIC_API_KEY is not set (or pass --skip-judge or --skip-agent)");
      process.exit(1);
    }

    const result = await runBenchmark({
      split: options.split,
      resultsDir: options.resultsDir,
      artifactsDir: options.artifactsDir,
      skipRetrieval: options.skipRetrieval,
      skipAgent: options.skipAgent,
      skipJudge: options.skipJudge,
      skipStore: options.skipStore,
    });

    console.log(result.report);

    if (options.jsonOut) {
      const outputPath = resolve(options.jsonOut);
      await writeFile(
        outputPath,
        JSON.stringify(
          {
            record: result.record,
            comparison: result.comparison,
            failureAnalysis: result.failureAnalysis,
          },
          null,
          2,
        ),
        "utf8",
      );
      console.error(`[benchmark] wrote ${outputPath}`);
    }

    if (result.hasFailures || result.hasMetricRegressions) {
      process.exit(1);
    }
    return;
  }

  if (options.command === "agent") {
    if (!options.skipJudge && !process.env.ANTHROPIC_API_KEY) {
      console.error("Error: ANTHROPIC_API_KEY is not set");
      process.exit(1);
    }

    const run = await runAgentEval({
      split: options.split,
      ids: options.id ? [options.id] : undefined,
      artifactsDir: options.artifactsDir,
      skipRun: options.skipRun,
      skipJudge: options.skipJudge,
    });

    console.log(formatAgentEvalReport(run.summary));

    if (options.jsonOut) {
      const outputPath = resolve(options.jsonOut);
      await writeFile(outputPath, JSON.stringify(run.summary, null, 2), "utf8");
      console.error(`[agent-eval] wrote ${outputPath}`);
    }

    if (run.summary.failures.length > 0) {
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
