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
        blocked ? "border-rose-300/15 bg-rose-300/[0.06] text-rose-100/90" : "border-amber-300/15 bg-amber-300/[0.06] text-amber-100/90",
      )}
      role="alert"
    >
      <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{blocked ? "Policy blocked" : "Policy warning"}</p>
        {summary ? <p className="mt-0.5 text-white/70">{summary}</p> : null}
        {messages[0] ? <p className="mt-0.5 line-clamp-2 text-white/55">{messages[0]}</p> : null}
      </div>
    </div>
  );
}
