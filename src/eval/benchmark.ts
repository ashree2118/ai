import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { runAgentEval, type RunAgentEvalOptions } from "./agent-runner.js";
import type { EvalSplit } from "./dataset/loader.js";
import type { AgentEvalSummary, EvalSummary } from "./metrics.js";
import {
  compareBenchmarkRuns,
  extractBenchmarkMetrics,
  formatRegressionReport,
  hasRegressions,
  loadLatestRun,
  makeRunId,
  readGitSha,
  saveBenchmarkRun,
  type BenchmarkRunRecord,
  type RegressionComparison,
} from "./regression.js";
import { runDatasetEvalPipeline } from "./runner.js";

export const DEFAULT_ARTIFACTS_DIR = "eval-artifacts";

export type RunBenchmarkOptions = {
  split?: EvalSplit | "all";
  resultsDir?: string;
  artifactsDir?: string;
  skipRetrieval?: boolean;
  skipAgent?: boolean;
  skipJudge?: boolean;
  skipStore?: boolean;
  runRetrieval?: (split: EvalSplit | "all") => Promise<EvalSummary>;
  runAgent?: (options: RunAgentEvalOptions) => Promise<AgentEvalSummary>;
  onProgress?: (message: string) => void;
};

export type BenchmarkResult = {
  record: BenchmarkRunRecord;
  comparison: RegressionComparison;
  report: string;
  hasFailures: boolean;
  hasMetricRegressions: boolean;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveArtifactsDir(
  artifactsDir: string | undefined,
): Promise<string | undefined> {
  if (artifactsDir) {
    return resolve(artifactsDir);
  }

  const fromEnv = process.env.EVAL_ARTIFACTS_DIR;
  if (fromEnv) {
    return resolve(fromEnv);
  }

  const defaultDir = resolve(DEFAULT_ARTIFACTS_DIR);
  if (await pathExists(defaultDir)) {
    return defaultDir;
  }

  return undefined;
}

export async function runBenchmark(
  options: RunBenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const split = options.split ?? "test";
  const resultsDir = resolve(options.resultsDir ?? "eval-results");
  const log = options.onProgress ?? ((message: string) => console.error(message));
  const previous = options.skipStore ? null : await loadLatestRun(resultsDir);

  let retrieval: EvalSummary | null = null;
  if (!options.skipRetrieval) {
    log(`[benchmark] running retrieval eval (split=${split})`);
    const runRetrieval = options.runRetrieval ?? runDatasetEvalPipeline;
    retrieval = await runRetrieval(split);
  }

  let agent: AgentEvalSummary | null = null;
  if (!options.skipAgent) {
    if (options.runAgent) {
      agent = await options.runAgent({
        split,
        artifactsDir: options.artifactsDir,
        skipJudge: options.skipJudge,
      });
    } else {
      const artifactsDir = await resolveArtifactsDir(options.artifactsDir);
      if (!artifactsDir) {
        log(
          "[benchmark] skipping agent eval (no artifacts dir; set EVAL_ARTIFACTS_DIR or create eval-artifacts/)",
        );
      } else {
        log(`[benchmark] running agent eval from ${artifactsDir}`);
        agent = await runAgentEval({
          split,
          artifactsDir,
          skipJudge: options.skipJudge,
        });
      }
    }
  }

  const metrics = extractBenchmarkMetrics(retrieval, agent);
  const record: BenchmarkRunRecord = {
    id: makeRunId(),
    timestamp: new Date().toISOString(),
    gitSha: await readGitSha(),
    split,
    metrics,
    retrieval,
    agent,
  };

  const comparison = compareBenchmarkRuns(metrics, previous?.metrics ?? null);
  comparison.previousRunId = previous?.id ?? null;

  if (!options.skipStore) {
    const runPath = await saveBenchmarkRun(resultsDir, record);
    log(`[benchmark] saved ${runPath}`);
  }

  const hasFailures =
    (retrieval?.failures.length ?? 0) > 0 || (agent?.failures.length ?? 0) > 0;
  const hasMetricRegressions = hasRegressions(comparison);

  return {
    record,
    comparison,
    report: formatRegressionReport(record, comparison),
    hasFailures,
    hasMetricRegressions,
  };
}
