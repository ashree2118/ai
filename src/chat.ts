#!/usr/bin/env node

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Conversation } from "./conversation.js";

function parseArgs(argv: string[]): { system?: string } {
  const options: { system?: string } = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--system" && argv[i + 1]) {
      options.system = argv[++i];
    }
  }

  return options;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const { system } = parseArgs(process.argv.slice(2));
  const conversation = new Conversation({ system });

  console.log("Multi-turn chat. Type /reset to clear history, /quit to exit.");
  if (system) {
    console.log(`system: ${system}`);
  }

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const line = (await rl.question("\nyou> ")).trim();
      if (!line) continue;

      if (line === "/quit" || line === "/exit") break;
      if (line === "/reset") {
        conversation.reset();
        console.log("conversation cleared");
        continue;
      }

      const { text } = await conversation.send(line);
      console.log(`\nassistant> ${text}`);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
