import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

const BLOCKED_FILE_PATTERNS = [
  /^\.env$/i,
  /credentials/i,
  /secrets?\./i,
];

export type GitChangeSnapshot = {
  modifiedFiles: string[];
  diff: string;
};

export function parsePorcelainPaths(status: string): string[] {
  const paths: string[] = [];
  for (const line of status.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = line.slice(3).trim();
    if (!entry) continue;
    const path = entry.includes(" -> ")
      ? entry.split(" -> ").pop()!.trim()
      : entry;
    paths.push(path.replace(/\\/g, "/"));
  }
  return paths;
}

export function mergeChangedPaths(...lists: readonly string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const path of list) {
      const normalized = path.replace(/\\/g, "/");
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(normalized);
    }
  }
  return merged.sort();
}

export function isBlockedPath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(base));
}

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

export async function collectGitChanges(
  repoRoot = process.cwd(),
): Promise<GitChangeSnapshot> {
  const [diffNames, cachedNames, status] = await Promise.all([
    runGit(repoRoot, ["diff", "--name-only", "HEAD"]),
    runGit(repoRoot, ["diff", "--cached", "--name-only", "HEAD"]),
    runGit(repoRoot, ["status", "--porcelain"]),
  ]);

  const modifiedFiles = mergeChangedPaths(
    diffNames ? diffNames.split(/\r?\n/) : [],
    cachedNames ? cachedNames.split(/\r?\n/) : [],
    parsePorcelainPaths(status),
  );

  const diff = await runGit(repoRoot, ["diff", "HEAD"]);

  return { modifiedFiles, diff };
}

export async function verifyModifiedFiles(
  modifiedFiles: string[],
  repoRoot = process.cwd(),
): Promise<{ passed: boolean; details: string }> {
  if (modifiedFiles.length === 0) {
    return {
      passed: true,
      details: "No modified files detected.",
    };
  }

  const blocked = modifiedFiles.filter(isBlockedPath);
  if (blocked.length > 0) {
    return {
      passed: false,
      details: `Blocked paths cannot be included in a PR: ${blocked.join(", ")}`,
    };
  }

  const missing: string[] = [];
  for (const file of modifiedFiles) {
    if (file.endsWith("/")) continue;
    try {
      await access(resolve(repoRoot, file), constants.F_OK);
    } catch {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    return {
      passed: false,
      details: `Modified files missing on disk: ${missing.join(", ")}`,
    };
  }

  return {
    passed: true,
    details: `Verified ${modifiedFiles.length} modified file(s).`,
  };
}

export function verifyGitDiff(diff: string): { passed: boolean; details: string } {
  if (!diff.trim()) {
    return {
      passed: true,
      details: "Git diff is empty.",
    };
  }

  const lineCount = diff.split(/\r?\n/).length;
  return {
    passed: true,
    details: `Captured git diff (${lineCount} line(s)).`,
  };
}
