import assert from "node:assert/strict";
import test from "node:test";
import { getEvalIssue } from "./dataset/loader.js";
import {
  buildJudgePrompt,
  judgeScore,
  parseJudgeRubric,
} from "./judge.js";

test("buildJudgePrompt includes issue, reference fix, and agent output", () => {
  const issue = getEvalIssue("eval-01");
  assert.ok(issue);

  const prompt = buildJudgePrompt({
    issue,
    agentSummary: "Added count command.",
    diff: "diff --git a/src/index.ts",
    modifiedFiles: ["src/index.ts"],
  });

  assert.match(prompt, /Add token counting CLI for files/);
  assert.match(prompt, /c04e1f2/);
  assert.match(prompt, /Added count command/);
  assert.match(prompt, /src\/index\.ts/);
});

test("parseJudgeRubric extracts and clamps structured scores", () => {
  const rubric = parseJudgeRubric(`{
    "correctness": 0.9,
    "completeness": 0.8,
    "approachQuality": 1.2,
    "accepted": true,
    "rationale": "Looks good."
  }`);

  assert.equal(rubric.correctness, 0.9);
  assert.equal(rubric.completeness, 0.8);
  assert.equal(rubric.approachQuality, 1);
  assert.equal(rubric.accepted, true);
  assert.equal(rubric.rationale, "Looks good.");
  assert.equal(judgeScore(rubric), (0.9 + 0.8 + 1) / 3);
});

test("parseJudgeRubric accepts JSON embedded in prose", () => {
  const rubric = parseJudgeRubric(
    'Here is my verdict:\n{"correctness":0.5,"completeness":0.5,"approachQuality":0.5,"accepted":false,"rationale":"Incomplete."}',
  );

  assert.equal(rubric.accepted, false);
  assert.equal(rubric.rationale, "Incomplete.");
});
