import {
  createAutoApprovalHandler,
  createCliApprovalHandler,
} from "./cli-approver.js";
import { HitlGate } from "./gate.js";

export function shouldEnableHitl(override?: boolean): boolean {
  if (override !== undefined) return override;
  const value = process.env.ENABLE_HITL?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function shouldAutoApproveHitl(): boolean {
  const value = process.env.HITL_AUTO_APPROVE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function createHitlGate(enabled?: boolean): HitlGate | undefined {
  if (!shouldEnableHitl(enabled)) return undefined;

  const handler = shouldAutoApproveHitl()
    ? createAutoApprovalHandler("approved")
    : createCliApprovalHandler();

  return new HitlGate(handler, true);
}
