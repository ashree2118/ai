#!/usr/bin/env node

import {
  formatVerificationReport,
  runVerification,
} from "./verification/runner.js";

async function main() {
  const skipTests = process.argv.includes("--skip-tests");
  const skipTypecheck = process.argv.includes("--skip-typecheck");
  const skipDocker = process.argv.includes("--skip-docker");

  const result = await runVerification({
    skipTests,
    skipTypecheck,
    skipDocker,
  });

  console.log(formatVerificationReport(result));
  process.exit(result.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
