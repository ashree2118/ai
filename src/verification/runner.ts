import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  collectGitChanges,
  verifyGitDiff,
  verifyModifiedFiles,
} from "./git.js";

const execFileAsync = promisify(execFile);

export type VerificationCheck = {
  name: string;
  passed: boolean;
  details: string;
};

export type VerificationResult = {
  passed: boolean;
  modifiedFiles: string[];
  diff: string;
  checks: VerificationCheck[];
};

export type VerificationOptions = {
  repoRoot?: string;
  skipDocker?: boolean;
  skipTests?: boolean;
  skipTypecheck?: boolean;
};

export class VerificationError extends Error {
  readonly result: VerificationResult;

  constructor(result: VerificationResult) {
    super(formatVerificationFailure(result));
    this.name = "VerificationError";
    this.result = result;
  }
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runNpmScript(
  script: string,
  repoRoot: string,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(
    npmCommand(),
    ["run", script],
    {
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    },
  );
  return {
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  };
}

async function runDockerPostgres(repoRoot: string): Promise<VerificationCheck> {
  if (process.env.VERIFY_SKIP_DOCKER === "1") {
    return {
      name: "docker",
      passed: true,
      details: "Skipped (VERIFY_SKIP_DOCKER=1).",
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      name: "docker",
      passed: true,
      details: "Skipped (DATABASE_URL not set).",
    };
  }

  try {
    await execFileAsync(
      "docker",
      ["compose", "up", "-d", "postgres"],
      { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024 },
    );
    return {
      name: "docker",
      passed: true,
      details: "Started postgres via docker compose.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "docker",
      passed: false,
      details: `docker compose up failed: ${message}`,
    };
  }
}

function summarizeOutput(stdout: string, stderr: string, max = 600): string {
  const combined = `${stdout}\n${stderr}`.trim();
  if (!combined) return "(no output)";
  return combined.length <= max ? combined : `${combined.slice(0, max)}…`;
}

export function formatVerificationFailure(result: VerificationResult): string {
  const failed = result.checks.filter((check) => !check.passed);
  const lines = [
    "Verification failed; PR creation blocked.",
    `Modified files: ${result.modifiedFiles.join(", ") || "(none)"}`,
    ...failed.map((check) => `- ${check.name}: ${check.details}`),
  ];
  return lines.join("\n");
}

export function formatVerificationReport(result: VerificationResult): string {
  const lines = [
    `# Verification ${result.passed ? "passed" : "failed"}`,
    "",
    "## Modified files",
    ...(result.modifiedFiles.length
      ? result.modifiedFiles.map((file) => `- ${file}`)
      : ["- (none)"]),
    "",
    "## Checks",
    ...result.checks.map(
      (check) =>
        `- ${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.details}`,
    ),
    "",
    "## Git diff",
    result.diff.trim() || "(empty)",
  ];
  return lines.join("\n");
}

export async function runVerification(
  options: VerificationOptions = {},
): Promise<VerificationResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const checks: VerificationCheck[] = [];
  const { modifiedFiles, diff } = await collectGitChanges(repoRoot);

  const modifiedCheck = await verifyModifiedFiles(modifiedFiles, repoRoot);
  checks.push({ name: "modified_files", ...modifiedCheck });

  const diffCheck = verifyGitDiff(diff);
  checks.push({ name: "git_diff", ...diffCheck });

  if (!options.skipDocker) {
    checks.push(await runDockerPostgres(repoRoot));
  }

  if (!options.skipTypecheck) {
    try {
      const { stdout, stderr } = await runNpmScript("build", repoRoot);
      checks.push({
        name: "typecheck",
        passed: true,
        details: summarizeOutput(stdout, stderr),
      });
    } catch (error) {
      const stdout =
        typeof error === "object" &&
        error !== null &&
        "stdout" in error &&
        error.stdout
          ? String(error.stdout)
          : "";
      const stderr =
        typeof error === "object" &&
        error !== null &&
        "stderr" in error &&
        error.stderr
          ? String(error.stderr)
          : error instanceof Error
            ? error.message
            : String(error);
      checks.push({
        name: "typecheck",
        passed: false,
        details: summarizeOutput(stdout, stderr),
      });
    }
  }

  if (!options.skipTests) {
    try {
      const { stdout, stderr } = await runNpmScript("test", repoRoot);
      checks.push({
        name: "tests",
        passed: true,
        details: summarizeOutput(stdout, stderr),
      });
    } catch (error) {
      const stdout =
        typeof error === "object" &&
        error !== null &&
        "stdout" in error &&
        error.stdout
          ? String(error.stdout)
          : "";
      const stderr =
        typeof error === "object" &&
        error !== null &&
        "stderr" in error &&
        error.stderr
          ? String(error.stderr)
          : error instanceof Error
            ? error.message
            : String(error);
      checks.push({
        name: "tests",
        passed: false,
        details: summarizeOutput(stdout, stderr),
      });
    }
  }

  const passed = checks.every((check) => check.passed);
  return { passed, modifiedFiles, diff, checks };
}

export function assertVerificationPassed(result: VerificationResult): void {
  if (!result.passed) {
    throw new VerificationError(result);
  }
}
