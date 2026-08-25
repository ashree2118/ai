#!/usr/bin/env node

import { formatEvalReport, runEvalPipeline } from "./eval/runner.js";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is not set");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY is not set");
    process.exit(1);
  }

  const summary = await runEvalPipeline();
  console.log(formatEvalReport(summary));

  if (summary.failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
