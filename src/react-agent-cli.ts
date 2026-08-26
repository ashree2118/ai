#!/usr/bin/env node

import { runReactAgent } from "./react-agent.js";

function parseTask(argv: string[]): string {
  const task = argv.join(" ").trim();
  if (!task) {
    console.error("Usage: react-agent <task>");
    process.exit(1);
  }
  return task;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const task = parseTask(process.argv.slice(2));
  const result = await runReactAgent(task);
  console.log(result.text);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
