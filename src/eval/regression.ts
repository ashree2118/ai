import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { EvalSplit } from "./dataset/loader.js";
import type { FailureAnalysisReport } from "./failure-analysis.js";
import type { AgentEvalSummary, EvalSummary } from "./metrics.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_RESULTS_DIR = "eval-results";
const DELTA_EPSILON = 0.0001;

export type BenchmarkMetrics = {
  retrievalMeanP1: number | null;
  retrievalMeanP5: number | null;
  retrievalMeanP10: number | null;
  agentFilePrecision: number | null;
  agentFileRecall: number | null;
  agentTestPassRate: number | null;
  agentPrAcceptanceRate: number | null;
  agentJudgeScore: number | null;
  agentPassRate: number | null;
};

export type BenchmarkRunRecord = {
  id: string;
  timestamp: string;
  gitSha: string | null;
  split: EvalSplit | "all";
  metrics: BenchmarkMetrics;
  retrieval: EvalSummary | null;
  agent: AgentEvalSummary | null;
  failureAnalysis?: FailureAnalysisReport;
};

export type RegressionStatus = "improved" | "regressed" | "unchanged" | "new";

export type RegressionDelta = {
  key: keyof BenchmarkMetrics;
  label: string;
  current: number | null;
  previous: number | null;
  delta: number | null;
  status: RegressionStatus;
};

export type RegressionComparison = {
  previousRunId: string | null;
  deltas: RegressionDelta[];
  improved: number;
  regressed: number;
  unchanged: number;
  newMetrics: number;
};

const METRIC_LABELS: Record<keyof BenchmarkMetrics, string> = {
  retrievalMeanP1: "Retrieval P@1",
  retrievalMeanP5: "Retrieval P@5",
  retrievalMeanP10: "Retrieval P@10",
  agentFilePrecision: "File precision",
  agentFileRecall: "File recall",
  agentTestPassRate: "Test pass rate",
  agentPrAcceptanceRate: "PR acceptance",
  agentJudgeScore: "Judge score",
  agentPassRate: "Agent pass rate",
};

export function makeRunId(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function readGitSha(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function extractBenchmarkMetrics(
  retrieval: EvalSummary | null,
  agent: AgentEvalSummary | null,
): BenchmarkMetrics {
  return {
    retrievalMeanP1: retrieval?.meanPrecisionAt1 ?? null,
    retrievalMeanP5: retrieval?.meanPrecisionAt5 ?? null,
    retrievalMeanP10: retrieval?.meanPrecisionAt10 ?? null,
    agentFilePrecision: agent?.meanFilePrecision ?? null,
    agentFileRecall: agent?.meanFileRecall ?? null,
    agentTestPassRate: agent?.testPassRate ?? null,
    agentPrAcceptanceRate: agent?.prAcceptanceRate ?? null,
    agentJudgeScore: agent?.meanJudgeScore ?? null,
    agentPassRate: agent
      ? agent.results.length === 0
        ? 0
        : agent.results.filter((result) => result.passed).length /
          agent.results.length
      : null,
  };
}

export function compareBenchmarkRuns(
  current: BenchmarkMetrics,
  previous: BenchmarkMetrics | null,
): RegressionComparison {
  const deltas: RegressionDelta[] = [];

  for (const key of Object.keys(METRIC_LABELS) as Array<keyof BenchmarkMetrics>) {
    const label = METRIC_LABELS[key];
    const currentValue = current[key];
    const previousValue = previous?.[key] ?? null;

    if (currentValue === null) {
      continue;
    }

    if (previousValue === null) {
      deltas.push({
        key,
        label,
        current: currentValue,
        previous: null,
        delta: null,
        status: "new",
      });
      continue;
    }

    const delta = currentValue - previousValue;
    let status: RegressionStatus = "unchanged";
    if (delta > DELTA_EPSILON) status = "improved";
    if (delta < -DELTA_EPSILON) status = "regressed";

    deltas.push({
      key,
      label,
      current: currentValue,
      previous: previousValue,
      delta,
      status,
    });
  }

  return {
    previousRunId: null,
    deltas,
    improved: deltas.filter((entry) => entry.status === "improved").length,
    regressed: deltas.filter((entry) => entry.status === "regressed").length,
    unchanged: deltas.filter((entry) => entry.status === "unchanged").length,
    newMetrics: deltas.filter((entry) => entry.status === "new").length,
  };
}

export function hasRegressions(comparison: RegressionComparison): boolean {
  return comparison.regressed > 0;
}

function formatDelta(delta: RegressionDelta): string {
  if (delta.status === "new") {
    return "(new)";
  }
  if (delta.delta === null) {
    return "";
  }

  const sign = delta.delta > 0 ? "+" : "";
  const arrow =
    delta.status === "improved" ? " ^" : delta.status === "regressed" ? " v" : "";
  return `(${sign}${delta.delta.toFixed(4)}${arrow})`;
}

function formatScore(value: number | null): string {
  if (value === null) return "n/a";
  return value.toFixed(4);
}

export function formatRegressionReport(
  record: BenchmarkRunRecord,
  comparison: RegressionComparison,
): string {
  const lines = [
    "========================================",
    "           EVAL BENCHMARK",
    "========================================",
    "",
    `Run ID:  ${record.id}`,
    `Time:    ${record.timestamp}`,
    `Git:     ${record.gitSha ?? "n/a"}`,
    `Split:   ${record.split}`,
    "",
  ];

  if (comparison.previousRunId) {
    lines.push(`Previous: ${comparison.previousRunId}`, "");
  } else {
    lines.push("Previous: (none)", "");
  }

  const sections: Array<{ title: string; keys: Array<keyof BenchmarkMetrics> }> = [
    {
      title: "RETRIEVAL",
      keys: ["retrievalMeanP1", "retrievalMeanP5", "retrievalMeanP10"],
    },
    {
      title: "AGENT",
      keys: [
        "agentFilePrecision",
        "agentFileRecall",
        "agentTestPassRate",
        "agentPrAcceptanceRate",
        "agentJudgeScore",
        "agentPassRate",
      ],
    },
  ];

  for (const section of sections) {
    const sectionDeltas = comparison.deltas.filter((delta) =>
      section.keys.includes(delta.key),
    );
    if (sectionDeltas.length === 0) {
      continue;
    }

    lines.push(section.title);
    for (const delta of sectionDeltas) {
      const name = delta.label.padEnd(18, " ");
      const score = formatScore(delta.current).padStart(7, " ");
      lines.push(`  ${name} ${score}  ${formatDelta(delta)}`);
    }
    lines.push("");
  }

  lines.push(
    "SUMMARY",
    `  improved:   ${comparison.improved}`,
    `  regressed:  ${comparison.regressed}`,
    `  unchanged:  ${comparison.unchanged}`,
    `  new:        ${comparison.newMetrics}`,
    "",
    "========================================",
  );

  return lines.join("\n");
}

export async function loadLatestRun(
  resultsDir: string,
): Promise<BenchmarkRunRecord | null> {
  try {
    const raw = await readFile(join(resultsDir, "latest.json"), "utf8");
    return JSON.parse(raw) as BenchmarkRunRecord;
  } catch {
    return null;
  }
}

export async function loadRun(
  resultsDir: string,
  runId: string,
): Promise<BenchmarkRunRecord | null> {
  try {
    const raw = await readFile(join(resultsDir, "runs", `${runId}.json`), "utf8");
    return JSON.parse(raw) as BenchmarkRunRecord;
  } catch {
    return null;
  }
}

export async function listRuns(resultsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(resultsDir, "runs"));
    return entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export async function saveBenchmarkRun(
  resultsDir: string,
  record: BenchmarkRunRecord,
): Promise<string> {
  const runsDir = join(resultsDir, "runs");
  await mkdir(runsDir, { recursive: true });

  const runPath = join(runsDir, `${record.id}.json`);
  const payload = JSON.stringify(record, null, 2);
  await writeFile(runPath, payload, "utf8");
  await writeFile(join(resultsDir, "latest.json"), payload, "utf8");
  return runPath;
}
