import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Check,
  CircleDollarSign,
  GitPullRequest,
  Loader2,
} from "lucide-react";
import { WINDOW } from "./landing-copy";

const STEP_MS = 1100;
const HOLD_MS = 4200;

/**
 * A stylised Neo console replaying one real-looking run on a loop: the
 * prompt, the agent's steps, the diff and the PR. Purely presentational.
 */
export function LandingProductWindow() {
  const reduce = useReducedMotion();
  const total = WINDOW.steps.length + 2; // steps, then diff, then result
  const [shown, setShown] = React.useState(reduce ? total : 0);

  React.useEffect(() => {
    if (reduce) return undefined;
    const delay = shown >= total ? HOLD_MS : STEP_MS;
    const id = window.setTimeout(
      () => setShown((n) => (n >= total ? 0 : n + 1)),
      delay,
    );
    return () => window.clearTimeout(id);
  }, [shown, total, reduce]);

  const showDiff = shown > WINDOW.steps.length;
  const showResult = shown > WINDOW.steps.length + 1;

  return (
    <div className="overflow-hidden rounded-[22px] border border-[var(--lp-line-strong)] bg-[#fff] shadow-[var(--lp-shadow-lg)]">
      <div className="flex items-center gap-3 border-b border-[var(--lp-line)] bg-[#f8fafc] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="lp-mono mx-auto rounded-md bg-[#fff] px-3 py-1 text-[11px] text-[var(--lp-ink-3)] ring-1 ring-[var(--lp-line)]">
          {WINDOW.url}
        </div>
      </div>

      <div className="grid min-h-[440px] grid-cols-1 md:grid-cols-[170px_1fr] lg:grid-cols-[170px_1fr_280px]">
        <aside className="hidden flex-col gap-1 border-r border-[var(--lp-line)] bg-[#fbfcfd] p-3 md:flex">
          {WINDOW.nav.map((item, i) => (
            <div
              key={item}
              className={`rounded-lg px-3 py-2 text-[13px] ${
                i === 0
                  ? "bg-[rgba(11,129,183,0.08)] font-medium text-[var(--lp-primary)]"
                  : "text-[var(--lp-ink-2)]"
              }`}
            >
              {item}
            </div>
          ))}
        </aside>

        <div className="flex flex-col gap-4 p-5 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold">{WINDOW.title}</div>
              <div className="lp-mono text-[11px] text-[var(--lp-ink-3)]">
                {WINDOW.repo}
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[rgba(18,161,80,0.1)] px-2.5 py-1 text-[11px] font-medium text-[var(--lp-green)]">
              <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-[var(--lp-green)]" />
              {WINDOW.status}
            </span>
          </div>

          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--lp-ink)] px-4 py-2.5 text-[13px] leading-relaxed text-[#fff]">
            {WINDOW.prompt}
          </div>

          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full lp-gradient-bg text-[#fff]">
              <Bot size={15} />
            </div>
            <ul className="flex flex-1 flex-col gap-2">
              {WINDOW.steps.map((step, i) => {
                const done = i < shown - 1 || showDiff;
                const active = i === shown - 1 && !showDiff;
                return (
                  <motion.li
                    key={step}
                    initial={false}
                    animate={{
                      opacity: i < shown ? 1 : 0,
                      y: i < shown ? 0 : 8,
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex items-center gap-2 text-[13px] text-[var(--lp-ink-2)]"
                  >
                    {active ? (
                      <Loader2
                        size={14}
                        className="shrink-0 animate-spin text-[var(--lp-primary)]"
                      />
                    ) : (
                      <Check
                        size={14}
                        className={`shrink-0 ${done ? "text-[var(--lp-green)]" : "text-transparent"}`}
                      />
                    )}
                    {step}
                  </motion.li>
                );
              })}
            </ul>
          </div>

          <AnimatePresence>
            {showDiff && (
              <motion.div
                key="diff"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="lp-mono overflow-hidden rounded-xl border border-[var(--lp-line)] text-[11.5px]"
              >
                <div className="border-b border-[var(--lp-line)] bg-[#f8fafc] px-3 py-1.5 text-[var(--lp-ink-3)]">
                  {WINDOW.diffFile}
                </div>
                <div className="truncate bg-[rgba(214,59,59,0.07)] px-3 py-1 text-[#b42318]">
                  {`- ${WINDOW.diffRemoved}`}
                </div>
                <div className="truncate bg-[rgba(18,161,80,0.08)] px-3 py-1 text-[#067647]">
                  {`+ ${WINDOW.diffAdded}`}
                </div>
              </motion.div>
            )}
            {showResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="flex items-center gap-2 rounded-xl bg-[rgba(11,129,183,0.07)] px-3 py-2 text-[13px] font-medium text-[var(--lp-primary-deep)]"
              >
                <GitPullRequest size={15} />
                {WINDOW.result}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden flex-col gap-3 border-l border-[var(--lp-line)] bg-[#fbfcfd] p-4 lg:flex">
          <div className="lp-mono text-[11px] uppercase tracking-wider text-[var(--lp-ink-3)]">
            {WINDOW.terminalTitle}
          </div>
          <div className="lp-mono flex flex-col gap-1.5 rounded-xl bg-[#fff] p-3 text-left text-[11px] leading-relaxed ring-1 ring-[var(--lp-line)]">
            {WINDOW.terminal.map((line, i) => (
              <motion.div
                key={line}
                initial={false}
                animate={{ opacity: shown > i + 2 ? 1 : 0.15 }}
                className={
                  line.startsWith("$")
                    ? "text-[var(--lp-ink)]"
                    : "text-[var(--lp-ink-3)]"
                }
              >
                {line}
              </motion.div>
            ))}
            <span className="lp-caret" />
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-xl bg-[#fff] p-3 text-[12px] text-[var(--lp-ink-2)] ring-1 ring-[var(--lp-line)]">
            <CircleDollarSign size={15} className="text-[var(--lp-primary)]" />
            {WINDOW.cost}
          </div>
        </div>
      </div>
    </div>
  );
}
