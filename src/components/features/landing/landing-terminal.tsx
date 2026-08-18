import React from "react";

interface TerminalLine {
  prefix: "$" | "→" | "✓";
  text: string;
}

const SCRIPT: TerminalLine[] = [
  { prefix: "$", text: "neodevex: fix the flaky checkout test" },
  { prefix: "→", text: "reading src/checkout/CartSummary.test.tsx" },
  { prefix: "→", text: "reproducing failure in sandboxed agent-server" },
  { prefix: "→", text: "found race condition in useCartTotals()" },
  { prefix: "→", text: "editing src/checkout/useCartTotals.ts" },
  { prefix: "→", text: "running test suite" },
  { prefix: "✓", text: "12 passed, 0 failed" },
  { prefix: "✓", text: "ready for review" },
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
 * A scripted, looping terminal "typing" simulation. Purely decorative —
 * illustrates the shape of a real agent session (read → reproduce → edit →
 * verify) without pretending to be a live connection to anything.
 */
export function LandingTerminal() {
  const [lineIndex, setLineIndex] = React.useState(0);
  const [charIndex, setCharIndex] = React.useState(0);

  React.useEffect(() => {
    const currentLine = SCRIPT[lineIndex];
    if (charIndex < currentLine.text.length) {
      const timer = window.setTimeout(
        () => setCharIndex((c) => c + 1),
        CHAR_INTERVAL_MS,
      );
      return () => window.clearTimeout(timer);
    }

    const isLastLine = lineIndex === SCRIPT.length - 1;
    const timer = window.setTimeout(
      () => {
        if (isLastLine) {
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
  }, [lineIndex, charIndex]);

  return (
    <div className="instrument-panel ame-card w-full max-w-xl overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[var(--border-color)] px-4 py-3">
        <span className="size-2.5 rounded-full bg-[var(--error-500)]" />
        <span className="size-2.5 rounded-full bg-[var(--warning-500)]" />
        <span className="size-2.5 rounded-full bg-[var(--success-500)]" />
      </div>
      <div className="flex min-h-[220px] flex-col gap-2 p-5 font-mono text-sm">
        {SCRIPT.slice(0, lineIndex).map((line) => (
          <div key={line.text} className={PREFIX_CLASSNAME[line.prefix]}>
            {line.prefix} {line.text}
          </div>
        ))}
        <div className={PREFIX_CLASSNAME[SCRIPT[lineIndex].prefix]}>
          {SCRIPT[lineIndex].prefix}{" "}
          {SCRIPT[lineIndex].text.slice(0, charIndex)}
          <span className="animate-pulse">{CURSOR}</span>
        </div>
      </div>
    </div>
  );
}
