import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createGithubClient,
  createGithubDraftPullRequest,
  type GithubIssueRef,
} from "./toolkit.js";

const execFileAsync = promisify(execFile);

export type PublishDraftPrInput = {
  owner: string;
  repo: string;
  issue: GithubIssueRef;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  commitMessage: string;
  repoRoot?: string;
};

export type PublishDraftPrResult = {
  branch: string;
  commitSha: string;
  prNumber: number;
  prUrl: string;
};

async function runGit(
  repoRoot: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function configureGitUser(repoRoot: string): Promise<void> {
  const name = process.env.GIT_USER_NAME ?? "github-actions[bot]";
  const email = process.env.GIT_USER_EMAIL ?? "41898282+github-actions[bot]@users.noreply.github.com";
  await runGit(repoRoot, ["config", "user.name", name]);
  await runGit(repoRoot, ["config", "user.email", email]);
}

export function buildAgentFixBranch(issueNumber: number): string {
  return `agent-fix/issue-${issueNumber}`;
}

export async function publishDraftPullRequest(
  input: PublishDraftPrInput,
): Promise<PublishDraftPrResult> {
  const repoRoot = input.repoRoot ?? process.cwd();
  await configureGitUser(repoRoot);

  try {
    await runGit(repoRoot, ["checkout", "-b", input.branch]);
  } catch {
    await runGit(repoRoot, ["checkout", input.branch]);
  }

  await runGit(repoRoot, ["add", "-A"]);
  await runGit(repoRoot, ["commit", "-m", input.commitMessage]);
  const commitSha = await runGit(repoRoot, ["rev-parse", "HEAD"]);

  const remote = process.env.GITHUB_SERVER_URL
    ? `${process.env.GITHUB_SERVER_URL}/${input.owner}/${input.repo}.git`
    : `https://github.com/${input.owner}/${input.repo}.git`;

  await execFileAsync(
    "git",
    ["push", "--force-with-lease", remote, `HEAD:${input.branch}`],
    {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  );

  const octokit = createGithubClient();
  const pr = await createGithubDraftPullRequest(octokit, {
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    head: input.branch,
    base: input.baseBranch,
    body: input.body,
  });

  return {
    branch: input.branch,
    commitSha,
    prNumber: pr.number,
    prUrl: pr.html_url,
  };
}
