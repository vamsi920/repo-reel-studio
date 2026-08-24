import React from "react";

interface TerminalLine {
  prefix: "$" | "→" | "✓";
  text: string;
}

interface TerminalScenario {
  id: string;
  label: string;
  lines: TerminalLine[];
}

const SCENARIOS: TerminalScenario[] = [
  {
    id: "bugfix",
    label: "Fixing a bug",
    lines: [
      { prefix: "$", text: "neo: fix the flaky checkout test" },
      { prefix: "→", text: "reading src/checkout/CartSummary.test.tsx" },
      { prefix: "→", text: "reproducing failure in sandboxed agent-server" },
      { prefix: "→", text: "found race condition in useCartTotals()" },
      { prefix: "→", text: "editing src/checkout/useCartTotals.ts" },
      { prefix: "→", text: "running test suite" },
      { prefix: "✓", text: "12 passed, 0 failed" },
      { prefix: "✓", text: "ready for review" },
    ],
  },
  {
    id: "ticket",
    label: "Working a ticket",
    lines: [
      { prefix: "$", text: "neo: pick up ENG-4831 from Jira" },
      { prefix: "→", text: 'reading ticket "Add SSO session refresh"' },
      { prefix: "→", text: "mapping requirements to src/auth/session.ts" },
      { prefix: "→", text: "drafting implementation plan" },
      { prefix: "→", text: "implementing refreshSession() + tests" },
      { prefix: "→", text: "running auth test suite" },
      { prefix: "✓", text: "8 files changed, 3 tests added" },
      { prefix: "✓", text: "ENG-4831 moved to In Review" },
    ],
  },
  {
    id: "connector",
    label: "Querying a data source",
    lines: [
      { prefix: "$", text: "neo: why did checkout conversion drop?" },
      { prefix: "→", text: "connecting to Snowflake: analytics.checkout" },
      { prefix: "→", text: "querying conversion_events (last 14 days)" },
      { prefix: "→", text: "correlating with deploy log in GitHub" },
      { prefix: "→", text: "isolating regression to release v2.14.0" },
      { prefix: "→", text: "tracing to src/payments/retryPolicy.ts" },
      { prefix: "✓", text: "root cause identified, patch drafted" },
      { prefix: "✓", text: "findings and query trail attached to ticket" },
    ],
  },
  {
    id: "memory",
    label: "Recalling context",
    lines: [
      { prefix: "$", text: "neo: touch base on the billing service" },
      { prefix: "→", text: "recalling repo memory: billing-service" },
      { prefix: "→", text: "last touched 12 days ago — 3 open threads" },
      { prefix: "→", text: "remembered: invoice retries use idempotency keys" },
      { prefix: "→", text: "remembered: migration to Postgres 16 is pending" },
      { prefix: "→", text: "loading architecture and prior decisions" },
      { prefix: "✓", text: "context restored, ready to continue" },
    ],
  },
];

const CURSOR = "▌";
const CHAR_INTERVAL_MS = 18;
const LINE_PAUSE_MS = 380;
const LOOP_PAUSE_MS = 2200;

const PREFIX_CLASSNAME: Record<TerminalLine["prefix"], string> = {
  $: "text-[var(--primary-500)]",
  "→": "text-[var(--text-tertiary)]",
  "✓": "font-semibold text-[var(--success-500)]",
};

/**
 * A scripted, looping terminal "typing" simulation that cycles through
 * several short scenarios (bug fix, ticket pickup, data-source query, repo
 * memory recall). Purely decorative — illustrates the shape of a real agent
 * session without pretending to be a live connection to anything.
 */
export function LandingTerminal() {
  const [scenarioIndex, setScenarioIndex] = React.useState(0);
  const [lineIndex, setLineIndex] = React.useState(0);
  const [charIndex, setCharIndex] = React.useState(0);

  const scenario = SCENARIOS[scenarioIndex];

  React.useEffect(() => {
    const currentLine = scenario.lines[lineIndex];
    if (charIndex < currentLine.text.length) {
      const timer = window.setTimeout(
        () => setCharIndex((c) => c + 1),
        CHAR_INTERVAL_MS,
      );
      return () => window.clearTimeout(timer);
    }

    const isLastLine = lineIndex === scenario.lines.length - 1;
    const timer = window.setTimeout(
      () => {
        if (isLastLine) {
          setScenarioIndex((s) => (s + 1) % SCENARIOS.length);
          setLineIndex(0);
          setCharIndex(0);
        } else {
          setLineIndex((i) => i + 1);
          setCharIndex(0);
        }
      },
      isLastLine ? LOOP_PAUSE_MS : LINE_PAUSE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [scenario, lineIndex, charIndex]);

  return (
    <div className="instrument-panel ame-card w-full max-w-xl overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[var(--border-color)] px-4 py-3">
        <span className="size-2.5 rounded-full bg-[var(--error-500)]" />
        <span className="size-2.5 rounded-full bg-[var(--warning-500)]" />
        <span className="size-2.5 rounded-full bg-[var(--success-500)]" />
        <span className="ml-auto font-mono text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
          {scenario.label}
        </span>
      </div>
      <div className="flex min-h-[220px] flex-col gap-2 p-5 font-mono text-sm">
        {scenario.lines.slice(0, lineIndex).map((line) => (
          <div key={line.text} className={PREFIX_CLASSNAME[line.prefix]}>
            {line.prefix} {line.text}
          </div>
        ))}
        <div className={PREFIX_CLASSNAME[scenario.lines[lineIndex].prefix]}>
          {scenario.lines[lineIndex].prefix}{" "}
          {scenario.lines[lineIndex].text.slice(0, charIndex)}
          <span className="animate-pulse">{CURSOR}</span>
        </div>
      </div>
    </div>
  );
}
