import { ListChecks } from "lucide-react";

/* eslint-disable i18next/no-literal-string -- decorative landing mockup copy */

interface WorkItem {
  title: string;
  status: "Working" | "In review" | "Shipped";
}

const ITEMS: WorkItem[] = [
  { title: "Add SSO session refresh", status: "Working" },
  { title: "Fix the flaky checkout test", status: "In review" },
  { title: "Migrate billing service to Postgres 16", status: "Shipped" },
  { title: "Investigate conversion drop in checkout", status: "Working" },
];

const STATUS_CLASSNAME: Record<WorkItem["status"], string> = {
  Working: "bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]",
  "In review": "bg-[var(--warning-bg-subtle)] text-[var(--warning-500)]",
  Shipped: "bg-[var(--success-bg-subtle)] text-[var(--success-500)]",
};

/**
 * A small, illustrative "active sessions" board — not a live screenshot, a
 * hand-built mockup using the app's own card chrome and tokens. Gives the
 * how-it-works steps something concrete to look at instead of four bare
 * numbered text blocks.
 */
export function LandingTaskBoardMockup() {
  return (
    <div className="instrument-panel ame-card w-full max-w-lg overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <ListChecks
          className="size-3.5 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
          Active sessions
        </span>
      </div>
      <div className="flex flex-col divide-y divide-[var(--border-color)]">
        {ITEMS.map((item) => (
          <div
            key={item.title}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span className="text-sm text-[var(--text-primary)]">
              {item.title}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASSNAME[item.status]}`}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
