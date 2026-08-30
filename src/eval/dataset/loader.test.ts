import assert from "node:assert/strict";
import test from "node:test";
import {
  datasetCorpusFiles,
  getEvalIssue,
  loadEvalDataset,
  loadEvalIssues,
  loadEvalSplit,
  summarizeEvalDataset,
  toEvalQuery,
  toRetrievalEvalIssue,
} from "./loader.js";

test("loadEvalDataset returns 20 issues with 15 train and 5 test", () => {
  const summary = summarizeEvalDataset();
  assert.equal(summary.total, 20);
  assert.equal(summary.trainCount, 15);
  assert.equal(summary.testCount, 5);
});

test("loadEvalSplit returns only requested split", () => {
  const train = loadEvalSplit("train");
  const testIssues = loadEvalSplit("test");

  assert.equal(train.length, 15);
  assert.equal(testIssues.length, 5);
  assert.ok(train.every((issue) => issue.split === "train"));
  assert.ok(testIssues.every((issue) => issue.split === "test"));
});

test("loadEvalIssues filters by ids", () => {
  const issues = loadEvalIssues({ ids: ["eval-01", "eval-16"] });
  assert.deepEqual(
    issues.map((issue) => issue.id),
    ["eval-01", "eval-16"],
  );
});

test("getEvalIssue returns structured fields", () => {
  const issue = getEvalIssue("eval-04");
  assert.ok(issue);
  assert.match(issue.issueText, /precise JSON schemas/i);
  assert.deepEqual(issue.correctFiles, ["src/tools.ts", "src/validation.ts"]);
  assert.match(issue.referenceFix.commit, /^[0-9a-f]{7}$/);
  assert.ok(issue.approach.length > 0);
});

test("toEvalQuery combines title, issue text, and approach", () => {
  const issue = getEvalIssue("eval-01");
  assert.ok(issue);
  const query = toEvalQuery(issue);
  assert.match(query, /token counting/i);
  assert.match(query, /count_tokens/i);
});

test("toRetrievalEvalIssue maps to retrieval eval shape", () => {
  const issue = getEvalIssue("eval-07");
  assert.ok(issue);
  const mapped = toRetrievalEvalIssue(issue);
  assert.equal(mapped.id, "eval-07");
  assert.deepEqual(mapped.relevantFiles, ["src/rag/store.ts", "src/rag/schema.ts"]);
});

test("datasetCorpusFiles deduplicates all correct files", () => {
  const files = datasetCorpusFiles(loadEvalDataset());
  assert.ok(files.includes("src/react-agent.ts"));
  assert.ok(files.includes("src/tool-loop.ts"));
  assert.equal(new Set(files).size, files.length);
});
