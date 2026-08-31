import assert from "node:assert/strict";
import test from "node:test";
import {
  readAgentFixIssueNumber,
  shouldRunAgentFixForLabel,
} from "./agent-fix.js";
import { buildAgentFixBranch } from "./git-publish.js";

test("buildAgentFixBranch uses issue number", () => {
  assert.equal(buildAgentFixBranch(123), "agent-fix/issue-123");
});

test("readAgentFixIssueNumber reads env", () => {
  const previous = process.env.AGENT_FIX_ISSUE_NUMBER;
  process.env.AGENT_FIX_ISSUE_NUMBER = "55";
  try {
    assert.equal(readAgentFixIssueNumber(), 55);
    assert.equal(readAgentFixIssueNumber(9), 9);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_FIX_ISSUE_NUMBER;
    } else {
      process.env.AGENT_FIX_ISSUE_NUMBER = previous;
    }
  }
});

test("readAgentFixIssueNumber rejects invalid values", () => {
  const previous = process.env.AGENT_FIX_ISSUE_NUMBER;
  process.env.AGENT_FIX_ISSUE_NUMBER = "0";
  try {
    assert.throws(() => readAgentFixIssueNumber(), /Invalid AGENT_FIX_ISSUE_NUMBER/);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_FIX_ISSUE_NUMBER;
    } else {
      process.env.AGENT_FIX_ISSUE_NUMBER = previous;
    }
  }
});

test("shouldRunAgentFixForLabel gates workflow trigger", () => {
  assert.equal(shouldRunAgentFixForLabel("agent-fix"), true);
  assert.equal(shouldRunAgentFixForLabel("enhancement"), false);
});
