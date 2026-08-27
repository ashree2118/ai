#!/usr/bin/env node

import { printAgentResult } from "./agent-output.js";
import { runE2EIssue } from "./e2e/run.js";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const { result, analysis, exitCode } = await runE2EIssue();
  console.log("\n--- analysis ---\n");
  console.log(analysis);
  printAgentResult(result);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
