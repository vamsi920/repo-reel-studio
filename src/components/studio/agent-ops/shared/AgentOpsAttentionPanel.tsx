import { AlertTriangle } from "lucide-react";

import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
import { cn } from "@/lib/utils";

export type AgentOpsAttentionPanelProps = {
  attention: AgentOpsAttention | null;
  className?: string;
};

export function AgentOpsAttentionPanel({ attention, className }: AgentOpsAttentionPanelProps) {
  if (!attention) return null;

  const showDetails =
    Boolean(attention.raw) &&
    attention.raw !== attention.message &&
    attention.raw.length > attention.message.length + 12;

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800",
        className,
      )}
      role={attention.kind === "generic" ? "alert" : "status"}
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">{attention.title}</p>
          <p className="mt-0.5 text-amber-800">{attention.message}</p>
          {attention.steps && attention.steps.length > 0 ? (
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[11px] leading-4 text-amber-700">
              {attention.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {showDetails ? (
            <details className="mt-2 group">
              <summary className="cursor-pointer list-none text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700/80 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Technical details</span>
                <span className="hidden group-open:inline">Hide details</span>
              </summary>
              <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-amber-200/40 bg-black/85 p-2 font-mono text-[10px] leading-4 text-amber-100/80">
                {attention.raw}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
