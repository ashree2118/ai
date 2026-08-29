import assert from "node:assert/strict";
import test from "node:test";
import { createAutoApprovalHandler } from "./cli-approver.js";
import { HitlGate, HitlRejectedError } from "./gate.js";
import { formatCheckpointPrompt, isPrCreationTool } from "./types.js";

test("isPrCreationTool identifies github_create_pr only", () => {
  assert.equal(isPrCreationTool("github_create_pr"), true);
  assert.equal(isPrCreationTool("github_read_file"), false);
  assert.equal(isPrCreationTool("read_file"), false);
});

test("HitlGate requires plan approval once before tools proceed", async () => {
  let planRequests = 0;
  const gate = new HitlGate(async (request) => {
    if (request.kind === "plan") planRequests += 1;
    return "approved";
  });

  await gate.ensurePlanApproved({
    assistantText: "I will inspect files.",
    plan: ["Inspect src/tools.ts"],
    pendingTools: ["read_file"],
  });
  await gate.ensurePlanApproved({
    assistantText: "Continuing.",
    plan: ["Inspect src/tools.ts"],
    pendingTools: ["read_file"],
  });

  assert.equal(planRequests, 1);
  assert.equal(gate.hasApprovedPlan, true);
});

test("HitlGate rejects plan and PR checkpoints", async () => {
  const gate = new HitlGate(createAutoApprovalHandler("rejected"));

  await assert.rejects(
    () =>
      gate.ensurePlanApproved({
        assistantText: "Plan",
        plan: ["Step 1"],
        pendingTools: ["list_files"],
      }),
    HitlRejectedError,
  );

  const prGate = new HitlGate(async (request) =>
    request.kind === "pr_creation" ? "rejected" : "approved",
  );

  await prGate.ensurePlanApproved({
    assistantText: "Plan approved",
    plan: ["Open PR"],
    pendingTools: ["github_create_pr"],
  });

  await assert.rejects(
    () =>
      prGate.ensurePrApproved({
        toolUse: {
          name: "github_create_pr",
          input: { title: "Fix", head: "feature", base: "main" },
        },
      }),
    HitlRejectedError,
  );
});

test("formatCheckpointPrompt includes plan and pending tools", () => {
  const prompt = formatCheckpointPrompt({
    kind: "plan",
    title: "Proposed plan requires approval",
    summary: "Ready to inspect files",
    details: "Plan:\n1. Inspect src/tools.ts",
    pendingTools: ["read_file", "github_read_file"],
  });

  assert.match(prompt, /Proposed plan requires approval/);
  assert.match(prompt, /read_file/);
  assert.match(prompt, /github_read_file/);
});
