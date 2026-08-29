import type {
  ApprovalHandler,
  PlanCheckpointContext,
  PrCheckpointContext,
} from "./types.js";
import { isPrCreationTool } from "./types.js";

export class HitlRejectedError extends Error {
  readonly kind: "plan" | "pr_creation";

  constructor(kind: "plan" | "pr_creation", message?: string) {
    super(message ?? `Human reviewer rejected ${kind.replace("_", " ")}`);
    this.name = "HitlRejectedError";
    this.kind = kind;
  }
}

export class HitlGate {
  private planApproved = false;
  private readonly enabled: boolean;
  private readonly handler: ApprovalHandler;

  constructor(handler: ApprovalHandler, enabled = true) {
    this.handler = handler;
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get hasApprovedPlan(): boolean {
    return this.planApproved;
  }

  async ensurePlanApproved(context: PlanCheckpointContext): Promise<void> {
    if (!this.enabled || this.planApproved) return;

    const planLines =
      context.plan.length > 0
        ? context.plan.map((step, index) => `${index + 1}. ${step}`).join("\n")
        : "(no structured plan yet)";

    const decision = await this.handler({
      kind: "plan",
      title: "Proposed plan requires approval",
      summary: context.assistantText.trim() || "The agent is ready to use tools.",
      details: ["Plan:", planLines].join("\n"),
      pendingTools: context.pendingTools,
    });

    if (decision === "rejected") {
      throw new HitlRejectedError("plan");
    }

    this.planApproved = true;
  }

  async ensurePrApproved(context: PrCheckpointContext): Promise<void> {
    if (!this.enabled || !isPrCreationTool(context.toolUse.name)) return;

    const input = context.toolUse.input as Record<string, unknown>;
    const title = typeof input.title === "string" ? input.title : "(untitled)";
    const head = typeof input.head === "string" ? input.head : "?";
    const base = typeof input.base === "string" ? input.base : "?";

    const decision = await this.handler({
      kind: "pr_creation",
      title: "Pull request creation requires approval",
      summary: `Create PR: ${title}`,
      details: `head=${head}\nbase=${base}`,
      toolUse: context.toolUse,
    });

    if (decision === "rejected") {
      throw new HitlRejectedError("pr_creation");
    }
  }
}
