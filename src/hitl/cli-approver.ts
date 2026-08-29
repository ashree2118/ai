import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type {
  ApprovalDecision,
  ApprovalHandler,
  CheckpointRequest,
} from "./types.js";
import { formatCheckpointPrompt } from "./types.js";

export async function promptApproval(
  request: CheckpointRequest,
): Promise<ApprovalDecision> {
  process.stderr.write(`${formatCheckpointPrompt(request)}\nApprove? [y/N]: `);
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question("")).trim().toLowerCase();
    if (answer === "y" || answer === "yes") return "approved";
    return "rejected";
  } finally {
    rl.close();
  }
}

export function createCliApprovalHandler(): ApprovalHandler {
  return promptApproval;
}

export function createAutoApprovalHandler(
  decision: ApprovalDecision = "approved",
): ApprovalHandler {
  return async () => decision;
}
