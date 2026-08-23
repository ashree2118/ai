import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateBranchInput,
  validateCreatePrInput,
  validateGetIssueInput,
  validateGithubToolInput,
  validateListFilesInput,
  validateReadFileInput,
  validateWriteFileInput,
} from "./toolkit.js";

const env = {
  GITHUB_OWNER: "acme",
  GITHUB_REPO: "demo",
  GITHUB_TOKEN: "test-token",
};

test("github validators accept valid input with env defaults", () => {
  const previousOwner = process.env.GITHUB_OWNER;
  const previousRepo = process.env.GITHUB_REPO;
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_OWNER = env.GITHUB_OWNER;
  process.env.GITHUB_REPO = env.GITHUB_REPO;
  process.env.GITHUB_TOKEN = env.GITHUB_TOKEN;

  try {
    assert.deepEqual(validateGetIssueInput({ issue_number: 12 }), {
      owner: "acme",
      repo: "demo",
      issue_number: 12,
    });
    assert.deepEqual(validateListFilesInput({ path: "src", ref: "main" }), {
      owner: "acme",
      repo: "demo",
      path: "src",
      ref: "main",
    });
    assert.deepEqual(validateReadFileInput({ path: "README.md" }), {
      owner: "acme",
      repo: "demo",
      path: "README.md",
    });
    assert.deepEqual(validateCreateBranchInput({ branch: "feature/x" }), {
      owner: "acme",
      repo: "demo",
      branch: "feature/x",
    });
    assert.deepEqual(
      validateWriteFileInput({
        path: "README.md",
        branch: "feature/x",
        message: "docs: update readme",
        content: "# Demo",
      }),
      {
        owner: "acme",
        repo: "demo",
        path: "README.md",
        branch: "feature/x",
        message: "docs: update readme",
        content: "# Demo",
      },
    );
    assert.deepEqual(
      validateCreatePrInput({
        title: "Add feature",
        head: "feature/x",
        base: "main",
        draft: true,
      }),
      {
        owner: "acme",
        repo: "demo",
        title: "Add feature",
        head: "feature/x",
        base: "main",
        draft: true,
      },
    );
  } finally {
    if (previousOwner === undefined) delete process.env.GITHUB_OWNER;
    else process.env.GITHUB_OWNER = previousOwner;
    if (previousRepo === undefined) delete process.env.GITHUB_REPO;
    else process.env.GITHUB_REPO = previousRepo;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
});

test("github validators reject invalid input", () => {
  const previousOwner = process.env.GITHUB_OWNER;
  const previousRepo = process.env.GITHUB_REPO;
  process.env.GITHUB_OWNER = env.GITHUB_OWNER;
  process.env.GITHUB_REPO = env.GITHUB_REPO;

  try {
    assert.throws(
      () => validateGetIssueInput({ issue_number: 0 }),
      /issue_number must be between/,
    );
    assert.throws(
      () => validateReadFileInput({ path: "README.md", extra: true }),
      /unexpected field: extra/,
    );
    assert.throws(
      () => validateCreatePrInput({ title: "x", head: "a", base: "b", draft: "no" }),
      /draft must be a boolean/,
    );
    assert.throws(
      () => validateGithubToolInput("github_missing", {}),
      /unknown github tool/,
    );
  } finally {
    if (previousOwner === undefined) delete process.env.GITHUB_OWNER;
    else process.env.GITHUB_OWNER = previousOwner;
    if (previousRepo === undefined) delete process.env.GITHUB_REPO;
    else process.env.GITHUB_REPO = previousRepo;
  }
});

test("github validators require owner/repo when env is missing", () => {
  const previousOwner = process.env.GITHUB_OWNER;
  const previousRepo = process.env.GITHUB_REPO;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;

  try {
    assert.throws(
      () => validateReadFileInput({ path: "README.md" }),
      /owner is required/,
    );
    assert.throws(
      () => validateCreateBranchInput({ owner: "acme", branch: "feature/x" }),
      /repo is required/,
    );
  } finally {
    if (previousOwner === undefined) delete process.env.GITHUB_OWNER;
    else process.env.GITHUB_OWNER = previousOwner;
    if (previousRepo === undefined) delete process.env.GITHUB_REPO;
    else process.env.GITHUB_REPO = previousRepo;
  }
});
