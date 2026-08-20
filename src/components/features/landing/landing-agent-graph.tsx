import {
  Bot,
  GitBranch,
  Ticket,
  Database,
  Brain,
  Waypoints,
} from "lucide-react";

/* eslint-disable i18next/no-literal-string -- decorative landing mockup labels */

const NODES = [
  { id: "github", label: "GitHub", icon: GitBranch, x: 18, y: 18 },
  { id: "jira", label: "Jira", icon: Ticket, x: 82, y: 18 },
  { id: "data", label: "Data", icon: Database, x: 18, y: 82 },
  { id: "memory", label: "Memory", icon: Brain, x: 82, y: 82 },
] as const;

const PATHS: Record<(typeof NODES)[number]["id"], string> = {
  github: "M 18,18 C 35,18 40,40 50,50",
  jira: "M 82,18 C 65,18 60,40 50,50",
  data: "M 18,82 C 35,82 40,60 50,50",
  memory: "M 82,82 C 65,82 60,60 50,50",
};

/**
 * A small always-on ambient diagram sitting below the terminal — GitHub,
 * Jira, a data source, and repo memory, all feeding into a central agent
 * node. Animated purely with native SVG SMIL (`animateMotion`/`mpath`), so
 * there's no timer, no React state, and no extra dependency — the pulses
 * just loop on their own once mounted.
 */
export function LandingAgentGraph() {
  return (
    <div className="instrument-panel ame-card w-full max-w-xl overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[var(--border-color)] px-4 py-3">
        <Waypoints
          className="size-3.5 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
          Connected systems
        </span>
      </div>

      <div className="relative h-[240px] p-5">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            {NODES.map(({ id }) => (
              <path key={id} id={`landing-graph-path-${id}`} d={PATHS[id]} />
            ))}
          </defs>

          {NODES.map(({ id }) => (
            <use
              key={id}
              href={`#landing-graph-path-${id}`}
              stroke="var(--border-color)"
              strokeWidth="0.6"
              fill="none"
            />
          ))}

          {NODES.map(({ id }, i) => (
            <circle key={id} r="1.4" fill="var(--primary-400)">
              <animateMotion
                dur="3.2s"
                begin={`${i * 0.8}s`}
                repeatCount="indefinite"
              >
                <mpath href={`#landing-graph-path-${id}`} />
              </animateMotion>
            </circle>
          ))}
        </svg>

        <div className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border border-[var(--primary-500)] bg-[var(--primary-bg-subtle)]">
          <Bot className="size-5 text-[var(--primary-500)]" aria-hidden />
        </div>
        <span className="absolute left-1/2 top-[62%] -translate-x-1/2 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
          Agent
        </span>

        {NODES.map(({ id, label, icon: Icon, x, y }) => (
          <div
            key={id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="flex size-9 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--background-primary)] text-[var(--text-secondary)]">
              <Icon className="size-4" aria-hidden />
            </div>
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
