#!/usr/bin/env node

import {
  formatAgentFixOutcome,
  runAgentFixFromEnv,
} from "./github/agent-fix.js";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }
  if (!process.env.GITHUB_TOKEN) {
    console.error("Error: GITHUB_TOKEN is not set");
    process.exit(1);
  }

  const outcome = await runAgentFixFromEnv({
    log: (message) => console.error(message),
  });

  console.log(formatAgentFixOutcome(outcome));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
