import { Shield } from "lucide-react";

import { cn } from "@/lib/utils";

export function PolicyBanner({
  status,
  summary,
  messages,
}: {
  status: "clear" | "warning" | "blocked" | string;
  summary: string | null;
  messages: string[];
}) {
  if (status === "clear" && messages.length === 0) return null;

  const blocked = status === "blocked";

  return (
    <div
      className={cn(
        "flex gap-2 border-b px-4 py-2.5 text-xs leading-5",
        blocked ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700",
      )}
      role="alert"
    >
      <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{blocked ? "Policy blocked" : "Policy warning"}</p>
        {summary ? (
          <p className={cn("mt-0.5", blocked ? "text-rose-700/85" : "text-amber-700/85")}>{summary}</p>
        ) : null}
        {messages[0] ? (
          <p className={cn("mt-0.5 line-clamp-2", blocked ? "text-rose-700/70" : "text-amber-700/70")}>
            {messages[0]}
          </p>
        ) : null}
      </div>
    </div>
  );
}
