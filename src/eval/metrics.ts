export function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function precisionAtK(
  retrievedFiles: string[],
  relevantFiles: readonly string[],
  k: number,
): number {
  const relevant = new Set(relevantFiles.map(normalizeFilePath));
  const top = retrievedFiles.slice(0, k);
  if (top.length === 0) return 0;

  let hits = 0;
  for (const file of top) {
    if (relevant.has(normalizeFilePath(file))) hits += 1;
  }

  return hits / k;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type IssueEvalResult = {
  issueId: string;
  title: string;
  query: string;
  relevantFiles: string[];
  retrievedFiles: string[];
  precisionAt1: number;
  precisionAt5: number;
  precisionAt10: number;
  passedAt1: boolean;
  passedAt5: boolean;
  passedAt10: boolean;
};

export function evaluateRetrieval(input: {
  issueId: string;
  title: string;
  query: string;
  relevantFiles: string[];
  retrievedFiles: string[];
}): IssueEvalResult {
  const precisionAt1 = precisionAtK(input.retrievedFiles, input.relevantFiles, 1);
  const precisionAt5 = precisionAtK(input.retrievedFiles, input.relevantFiles, 5);
  const precisionAt10 = precisionAtK(
    input.retrievedFiles,
    input.relevantFiles,
    10,
  );

  return {
    issueId: input.issueId,
    title: input.title,
    query: input.query,
    relevantFiles: input.relevantFiles.map(normalizeFilePath),
    retrievedFiles: input.retrievedFiles.map(normalizeFilePath),
    precisionAt1,
    precisionAt5,
    precisionAt10,
    passedAt1: precisionAt1 > 0,
    passedAt5: precisionAt5 > 0,
    passedAt10: precisionAt10 > 0,
  };
}

export type EvalSummary = {
  issueCount: number;
  meanPrecisionAt1: number;
  meanPrecisionAt5: number;
  meanPrecisionAt10: number;
  failures: IssueEvalResult[];
  results: IssueEvalResult[];
};

export function summarizeEval(results: IssueEvalResult[]): EvalSummary {
  return {
    issueCount: results.length,
    meanPrecisionAt1: mean(results.map((result) => result.precisionAt1)),
    meanPrecisionAt5: mean(results.map((result) => result.precisionAt5)),
    meanPrecisionAt10: mean(results.map((result) => result.precisionAt10)),
    failures: results.filter((result) => !result.passedAt10),
    results,
  };
}

export function fileSetOverlap(
  modifiedFiles: readonly string[],
  correctFiles: readonly string[],
): { truePositives: number; falsePositives: number; falseNegatives: number } {
  const modified = new Set(modifiedFiles.map(normalizeFilePath));
  const correct = new Set(correctFiles.map(normalizeFilePath));

  let truePositives = 0;
  for (const file of modified) {
    if (correct.has(file)) truePositives += 1;
  }

  return {
    truePositives,
    falsePositives: modified.size - truePositives,
    falseNegatives: correct.size - truePositives,
  };
}

export function filePrecision(
  modifiedFiles: readonly string[],
  correctFiles: readonly string[],
): number {
  const { truePositives, falsePositives } = fileSetOverlap(
    modifiedFiles,
    correctFiles,
  );
  const predicted = truePositives + falsePositives;
  if (predicted === 0) return correctFiles.length === 0 ? 1 : 0;
  return truePositives / predicted;
}

export function fileRecall(
  modifiedFiles: readonly string[],
  correctFiles: readonly string[],
): number {
  const { truePositives, falseNegatives } = fileSetOverlap(
    modifiedFiles,
    correctFiles,
  );
  const relevant = truePositives + falseNegatives;
  if (relevant === 0) return modifiedFiles.length === 0 ? 1 : 0;
  return truePositives / relevant;
}

export type DeterministicAgentMetrics = {
  filePrecision: number;
  fileRecall: number;
  testsPassed: boolean;
  verificationPassed: boolean;
};

export function testsPassedFromChecks(
  checks: ReadonlyArray<{ name: string; passed: boolean }>,
): boolean {
  const tests = checks.find((check) => check.name === "tests");
  return tests?.passed ?? false;
}

export function evaluateDeterministicAgent(input: {
  correctFiles: readonly string[];
  modifiedFiles: readonly string[];
  checks: ReadonlyArray<{ name: string; passed: boolean }>;
  verificationPassed: boolean;
}): DeterministicAgentMetrics {
  return {
    filePrecision: filePrecision(input.modifiedFiles, input.correctFiles),
    fileRecall: fileRecall(input.modifiedFiles, input.correctFiles),
    testsPassed: testsPassedFromChecks(input.checks),
    verificationPassed: input.verificationPassed,
  };
}

export type AgentIssueEvalResult = {
  issueId: string;
  title: string;
  split: "train" | "test";
  correctFiles: string[];
  modifiedFiles: string[];
  filePrecision: number;
  fileRecall: number;
  testsPassed: boolean;
  verificationPassed: boolean;
  prAccepted: boolean;
  judgeScore: number;
  judgeRationale: string;
  agentCompleted: boolean;
  passed: boolean;
};

export type AgentEvalSummary = {
  issueCount: number;
  meanFilePrecision: number;
  meanFileRecall: number;
  testPassRate: number;
  prAcceptanceRate: number;
  meanJudgeScore: number;
  failures: AgentIssueEvalResult[];
  results: AgentIssueEvalResult[];
};

export function summarizeAgentEval(
  results: AgentIssueEvalResult[],
): AgentEvalSummary {
  return {
    issueCount: results.length,
    meanFilePrecision: mean(results.map((result) => result.filePrecision)),
    meanFileRecall: mean(results.map((result) => result.fileRecall)),
    testPassRate: mean(results.map((result) => (result.testsPassed ? 1 : 0))),
    prAcceptanceRate: mean(results.map((result) => (result.prAccepted ? 1 : 0))),
    meanJudgeScore: mean(results.map((result) => result.judgeScore)),
    failures: results.filter((result) => !result.passed),
    results,
  };
}
