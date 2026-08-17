// Live "SME in action" indicator. Drop this into any surface (Processing,
// Studio header, Agent Ops) to show what the SME agent is doing right now
// for a project.

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSmeActivity,
  subscribeSmeActivity,
  type SmeActivity,
} from "@/lib/smeAgent";

const STATUS_STYLES: Record<
  string,
  { className: string; label: (a: SmeActivity) => string }
> = {
  checking: {
    className: "border-amber-300/40 bg-amber-300/10 text-amber-600",
    label: (a) => `SME checking ${a.label || "output"}…`,
  },
  verified: {
    className: "border-emerald-300/40 bg-emerald-300/10 text-emerald-600",
    label: (a) => `SME verified ${a.lastReview?.label || "output"}`,
  },
  flagged: {
    className: "border-red-300/40 bg-red-300/10 text-red-600",
    label: (a) =>
      `SME flagged ${a.lastReview?.findings.length || ""} issue${
        (a.lastReview?.findings.length || 0) === 1 ? "" : "s"
      }`,
  },
  attention: {
    className: "border-amber-300/40 bg-amber-300/10 text-amber-600",
    label: () => "SME needs attention",
  },
  no_material: {
    className: "border-border bg-muted text-muted-foreground",
    label: () => "SME idle — no domain docs yet",
  },
  error: {
    className: "border-border bg-muted text-muted-foreground",
    label: () => "SME unavailable",
  },
};

export function SmeStatusIndicator({
  projectId,
  className,
  onClick,
}: {
  projectId: string | null | undefined;
  className?: string;
  onClick?: () => void;
}) {
  const [activity, setActivity] = useState<SmeActivity>(() =>
    projectId ? getSmeActivity(projectId) : { state: "idle", lastReview: null }
  );

  useEffect(() => {
    if (!projectId) return;
    return subscribeSmeActivity(projectId, setActivity);
  }, [projectId]);

  if (!projectId) return null;

  const key =
    activity.state === "checking"
      ? "checking"
      : activity.lastReview?.status || "no_material";
  const style = STATUS_STYLES[key] || STATUS_STYLES.no_material;

  const Icon =
    key === "checking"
      ? Loader2
      : key === "verified"
        ? ShieldCheck
        : key === "flagged" || key === "attention"
          ? ShieldAlert
          : ShieldQuestion;

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid="sme-status-indicator"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        style.className,
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      title={activity.lastReview?.summary}
    >
      <Icon
        className={cn("h-3.5 w-3.5", key === "checking" && "animate-spin")}
      />
      <span>{style.label(activity)}</span>
      {key === "checking" && (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
    </Tag>
  );
}

export default SmeStatusIndicator;
