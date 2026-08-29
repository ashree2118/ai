import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { GITHUB_TOOLS, runGithubTool } from "./github/toolkit.js";
import { TOOLS as WORKSPACE_TOOLS, runWorkspaceTool } from "./tools.js";
import {
  assertVerificationPassed,
  runVerification,
  type VerificationOptions,
  type VerificationResult,
} from "./verification/runner.js";

export const TOOLS: Tool[] = [...WORKSPACE_TOOLS, ...GITHUB_TOOLS];

type GithubToolRunner = (name: string, input: unknown) => Promise<string>;
type VerificationRunner = (
  options?: VerificationOptions,
) => Promise<VerificationResult>;

let githubToolRunner: GithubToolRunner = runGithubTool;
let verificationRunner: VerificationRunner = runVerification;

export function setGithubToolRunner(runner: GithubToolRunner): void {
  githubToolRunner = runner;
}

export function resetGithubToolRunner(): void {
  githubToolRunner = runGithubTool;
}

export function setVerificationRunner(runner: VerificationRunner): void {
  verificationRunner = runner;
}

export function resetVerificationRunner(): void {
  verificationRunner = runVerification;
}

function shouldSkipVerification(): boolean {
  const value = process.env.SKIP_VERIFICATION?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export async function runTool(name: string, input: unknown): Promise<string> {
  if (name === "github_create_pr" && !shouldSkipVerification()) {
    const result = await verificationRunner();
    assertVerificationPassed(result);
  }

  if (name.startsWith("github_")) {
    return githubToolRunner(name, input);
  }
  return runWorkspaceTool(name, input);
}
