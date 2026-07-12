import type { AgentRunValidation } from "@/lib/agentRuns";

export function humanizeValidationOverall(status: AgentRunValidation["overallStatus"]) {
  if (status === "not_run") return "Not run";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function validationOverallTone(status: AgentRunValidation["overallStatus"]) {
  if (status === "passed") return "text-emerald-700 border-emerald-300/25 bg-emerald-300/8";
  if (status === "partial") return "text-amber-700 border-amber-300/25 bg-amber-300/8";
  if (status === "failed") return "text-rose-700 border-rose-300/25 bg-rose-300/8";
  return "text-muted-foreground border-border bg-muted";
}
