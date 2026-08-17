import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { cn } from "@/lib/utils";

type ValidationLikeStatus = "passed" | "partial" | "failed" | "not_run";

export function ValidationStatusBadge({ status }: { status: ValidationLikeStatus }) {
  const label = humanizeValidationStatus(status);
  const tone =
    status === "passed"
      ? "border-emerald-300/25 bg-emerald-300/8 text-emerald-700"
      : status === "partial"
        ? "border-amber-300/25 bg-amber-300/8 text-amber-700"
        : status === "failed"
          ? "border-rose-300/25 bg-rose-300/8 text-rose-700"
          : "border-border bg-muted text-muted-foreground";

  return (
    <span aria-label={statusAriaLabel("Validation", label)} className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", tone)}>
      {label}
    </span>
  );
}

function humanizeValidationStatus(status: ValidationLikeStatus) {
  if (status === "not_run") return "Not run";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
