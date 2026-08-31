import { Octokit } from "@octokit/rest";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  ToolInputError,
  assertInteger,
  assertNoExtraKeys,
  assertOptionalBoolean,
  assertOptionalString,
  assertString,
  isRecord,
} from "../validation.js";

export type GetIssueInput = {
  owner: string;
  repo: string;
  issue_number: number;
};

export type ListFilesInput = {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
};

export type ReadFileInput = {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
};

export type CreateBranchInput = {
  owner: string;
  repo: string;
  branch: string;
  from_ref?: string;
};

export type WriteFileInput = {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
  content: string;
  sha?: string;
};

export type CreatePrInput = {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
};

export const GITHUB_TOOLS: Tool[] = [
  {
    name: "github_get_issue",
    description: "Fetch a GitHub issue by number, including title, body, state, and labels.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner. Falls back to GITHUB_OWNER.",
          minLength: 1,
        },
        repo: {
          type: "string",
          description: "Repository name. Falls back to GITHUB_REPO.",
          minLength: 1,
        },
        issue_number: {
          type: "integer",
          description: "Issue number.",
          minimum: 1,
        },
      },
      required: ["issue_number"],
    },
  },
  {
    name: "github_list_files",
    description: "List files and directories at a path in a GitHub repository ref.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
        path: {
          type: "string",
          description: "Repository path. Use empty string for repo root.",
        },
        ref: {
          type: "string",
          description: "Branch, tag, or commit SHA. Defaults to the repo default branch.",
          minLength: 1,
        },
      },
      required: [],
    },
  },
  {
    name: "github_read_file",
    description: "Read a UTF-8 text file from a GitHub repository ref.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
        path: {
          type: "string",
          description: "Repository-relative file path.",
          minLength: 1,
        },
        ref: {
          type: "string",
          description: "Branch, tag, or commit SHA.",
          minLength: 1,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "github_create_branch",
    description: "Create a new branch from an existing ref.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
        branch: {
          type: "string",
          description: "New branch name without refs/heads prefix.",
          minLength: 1,
        },
        from_ref: {
          type: "string",
          description: "Source branch name or commit SHA. Defaults to the repo default branch.",
          minLength: 1,
        },
      },
      required: ["branch"],
    },
  },
  {
    name: "github_write_file",
    description: "Create or update a UTF-8 text file on a branch.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
        path: { type: "string", minLength: 1 },
        branch: { type: "string", minLength: 1 },
        message: { type: "string", minLength: 1 },
        content: { type: "string", description: "UTF-8 file contents." },
        sha: {
          type: "string",
          description: "Existing blob SHA. Required when updating a file.",
          minLength: 1,
        },
      },
      required: ["path", "branch", "message", "content"],
    },
  },
  {
    name: "github_create_pr",
    description: "Open a pull request from head branch into base branch.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
        title: { type: "string", minLength: 1 },
        head: {
          type: "string",
          description: "Head branch name or owner:branch for forks.",
          minLength: 1,
        },
        base: {
          type: "string",
          description: "Base branch to merge into.",
          minLength: 1,
        },
        body: { type: "string", description: "Pull request description." },
        draft: { type: "boolean", description: "Create as draft PR." },
      },
      required: ["title", "head", "base"],
    },
  },
];

function resolveOwner(value: string | undefined): string {
  const owner = value ?? process.env.GITHUB_OWNER;
  if (!owner) {
    throw new ToolInputError("owner is required (or set GITHUB_OWNER)");
  }
  return owner;
}

function resolveRepo(value: string | undefined): string {
  const repo = value ?? process.env.GITHUB_REPO;
  if (!repo) {
    throw new ToolInputError("repo is required (or set GITHUB_REPO)");
  }
  return repo;
}

export function createGithubClient(): Octokit {
  const auth = process.env.GITHUB_TOKEN;
  if (!auth) {
    throw new ToolInputError("GITHUB_TOKEN is not set");
  }
  return new Octokit({ auth });
}

export type GithubIssueRef = {
  number: number;
  title: string;
  body: string;
  html_url: string;
  state: string;
  labels: string[];
};

export async function fetchGithubIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GithubIssueRef> {
  const { data } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });
  return {
    number: data.number,
    title: data.title,
    body: data.body ?? "",
    html_url: data.html_url,
    state: data.state,
    labels: data.labels.map((label) =>
      typeof label === "string" ? label : (label.name ?? ""),
    ),
  };
}

export async function postIssueComment(
  octokit: Octokit,
  input: { owner: string; repo: string; issue_number: number; body: string },
): Promise<{ id: number; html_url: string }> {
  const { data } = await octokit.rest.issues.createComment({
    owner: input.owner,
    repo: input.repo,
    issue_number: input.issue_number,
    body: input.body,
  });
  return { id: data.id, html_url: data.html_url };
}

export async function createGithubDraftPullRequest(
  octokit: Octokit,
  input: CreatePrInput,
): Promise<{ number: number; html_url: string; title: string }> {
  const { data } = await octokit.rest.pulls.create({
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    head: input.head,
    base: input.base,
    body: input.body,
    draft: true,
  });
  return {
    number: data.number,
    html_url: data.html_url,
    title: data.title,
  };
}

export async function getDefaultBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

function formatIssue(data: Awaited<ReturnType<Octokit["rest"]["issues"]["get"]>>["data"]): string {
  return JSON.stringify(
    {
      number: data.number,
      title: data.title,
      state: data.state,
      labels: data.labels.map((label) =>
        typeof label === "string" ? label : label.name,
      ),
      user: data.user?.login ?? null,
      body: data.body,
      html_url: data.html_url,
    },
    null,
    2,
  );
}

async function resolveRefSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<string> {
  const normalized = ref.startsWith("refs/") ? ref : `heads/${ref}`;
  const { data } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: normalized,
  });
  return data.object.sha;
}

export function validateGetIssueInput(input: unknown): GetIssueInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["owner", "repo", "issue_number"]);

  return {
    owner: resolveOwner(assertOptionalString(input, "owner")),
    repo: resolveRepo(assertOptionalString(input, "repo")),
    issue_number: assertInteger(input, "issue_number", 1, Number.MAX_SAFE_INTEGER),
  };
}

export function validateListFilesInput(input: unknown): ListFilesInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["owner", "repo", "path", "ref"]);

  const validated: ListFilesInput = {
    owner: resolveOwner(assertOptionalString(input, "owner")),
    repo: resolveRepo(assertOptionalString(input, "repo")),
  };
  const path = assertOptionalString(input, "path", 0);
  const ref = assertOptionalString(input, "ref");
  if (path !== undefined) validated.path = path;
  if (ref !== undefined) validated.ref = ref;
  return validated;
}

export function validateReadFileInput(input: unknown): ReadFileInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["owner", "repo", "path", "ref"]);

  const validated: ReadFileInput = {
    owner: resolveOwner(assertOptionalString(input, "owner")),
    repo: resolveRepo(assertOptionalString(input, "repo")),
    path: assertString(input, "path"),
  };
  const ref = assertOptionalString(input, "ref");
  if (ref !== undefined) validated.ref = ref;
  return validated;
}

export function validateCreateBranchInput(input: unknown): CreateBranchInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["owner", "repo", "branch", "from_ref"]);

  const validated: CreateBranchInput = {
    owner: resolveOwner(assertOptionalString(input, "owner")),
    repo: resolveRepo(assertOptionalString(input, "repo")),
    branch: assertString(input, "branch"),
  };
  const fromRef = assertOptionalString(input, "from_ref");
  if (fromRef !== undefined) validated.from_ref = fromRef;
  return validated;
}

export function validateWriteFileInput(input: unknown): WriteFileInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["owner", "repo", "path", "branch", "message", "content", "sha"]);

  const validated: WriteFileInput = {
    owner: resolveOwner(assertOptionalString(input, "owner")),
    repo: resolveRepo(assertOptionalString(input, "repo")),
    path: assertString(input, "path"),
    branch: assertString(input, "branch"),
    message: assertString(input, "message"),
    content: assertString(input, "content", 0),
  };
  const sha = assertOptionalString(input, "sha");
  if (sha !== undefined) validated.sha = sha;
  return validated;
}

export function validateCreatePrInput(input: unknown): CreatePrInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["owner", "repo", "title", "head", "base", "body", "draft"]);

  const validated: CreatePrInput = {
    owner: resolveOwner(assertOptionalString(input, "owner")),
    repo: resolveRepo(assertOptionalString(input, "repo")),
    title: assertString(input, "title"),
    head: assertString(input, "head"),
    base: assertString(input, "base"),
  };
  const body = assertOptionalString(input, "body", 0);
  const draft = assertOptionalBoolean(input, "draft");
  if (body !== undefined) validated.body = body;
  if (draft !== undefined) validated.draft = draft;
  return validated;
}

export function validateGithubToolInput(name: string, input: unknown): void {
  switch (name) {
    case "github_get_issue":
      validateGetIssueInput(input);
      return;
    case "github_list_files":
      validateListFilesInput(input);
      return;
    case "github_read_file":
      validateReadFileInput(input);
      return;
    case "github_create_branch":
      validateCreateBranchInput(input);
      return;
    case "github_write_file":
      validateWriteFileInput(input);
      return;
    case "github_create_pr":
      validateCreatePrInput(input);
      return;
    default:
      throw new ToolInputError(`unknown github tool: ${name}`);
  }
}

async function githubGetIssue(input: GetIssueInput): Promise<string> {
  const octokit = createGithubClient();
  const { data } = await octokit.rest.issues.get({
    owner: input.owner,
    repo: input.repo,
    issue_number: input.issue_number,
  });
  return formatIssue(data);
}

async function githubListFiles(input: ListFilesInput): Promise<string> {
  const octokit = createGithubClient();
  const ref =
    input.ref ??
    (await getDefaultBranch(octokit, input.owner, input.repo));
  const { data } = await octokit.rest.repos.getContent({
    owner: input.owner,
    repo: input.repo,
    path: input.path ?? "",
    ref,
  });

  if (!Array.isArray(data)) {
    throw new ToolInputError(`path is not a directory: ${input.path ?? ""}`);
  }

  return data
    .map((entry) => `${entry.type === "dir" ? "[dir]" : "[file]"} ${entry.path}`)
    .join("\n");
}

async function githubReadFile(input: ReadFileInput): Promise<string> {
  const octokit = createGithubClient();
  const ref =
    input.ref ??
    (await getDefaultBranch(octokit, input.owner, input.repo));
  const { data } = await octokit.rest.repos.getContent({
    owner: input.owner,
    repo: input.repo,
    path: input.path,
    ref,
  });

  if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
    throw new ToolInputError(`path is not a file: ${input.path}`);
  }

  return Buffer.from(data.content, data.encoding as BufferEncoding).toString("utf8");
}

async function githubCreateBranch(input: CreateBranchInput): Promise<string> {
  const octokit = createGithubClient();
  const fromRef =
    input.from_ref ??
    (await getDefaultBranch(octokit, input.owner, input.repo));
  const sha = await resolveRefSha(octokit, input.owner, input.repo, fromRef);

  await octokit.rest.git.createRef({
    owner: input.owner,
    repo: input.repo,
    ref: `refs/heads/${input.branch}`,
    sha,
  });

  return JSON.stringify(
    { branch: input.branch, from_ref: fromRef, sha },
    null,
    2,
  );
}

async function githubWriteFile(input: WriteFileInput): Promise<string> {
  const octokit = createGithubClient();
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner: input.owner,
    repo: input.repo,
    path: input.path,
    branch: input.branch,
    message: input.message,
    content: Buffer.from(input.content, "utf8").toString("base64"),
    sha: input.sha,
  });

  return JSON.stringify(
    {
      path: input.path,
      branch: input.branch,
      commit: data.commit.sha,
      content_sha: data.content?.sha,
    },
    null,
    2,
  );
}

async function githubCreatePr(input: CreatePrInput): Promise<string> {
  const octokit = createGithubClient();
  const { data } = await octokit.rest.pulls.create({
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    head: input.head,
    base: input.base,
    body: input.body,
    draft: input.draft,
  });

  return JSON.stringify(
    {
      number: data.number,
      title: data.title,
      state: data.state,
      html_url: data.html_url,
    },
    null,
    2,
  );
}

export async function runGithubTool(name: string, input: unknown): Promise<string> {
  validateGithubToolInput(name, input);

  switch (name) {
    case "github_get_issue":
      return githubGetIssue(validateGetIssueInput(input));
    case "github_list_files":
      return githubListFiles(validateListFilesInput(input));
    case "github_read_file":
      return githubReadFile(validateReadFileInput(input));
    case "github_create_branch":
      return githubCreateBranch(validateCreateBranchInput(input));
    case "github_write_file":
      return githubWriteFile(validateWriteFileInput(input));
    case "github_create_pr":
      return githubCreatePr(validateCreatePrInput(input));
    default:
      throw new ToolInputError(`unknown github tool: ${name}`);
  }
}
