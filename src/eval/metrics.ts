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
