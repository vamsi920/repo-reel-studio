import React from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "framer-motion";
import { Check, CircleHelp, GitMerge, Ticket } from "lucide-react";
import { STORY, StoryStep, StoryVisual } from "./landing-copy";

type Step = StoryStep;

const EASE = [0.22, 1, 0.36, 1] as const;

const listItem = (i: number) => ({
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  transition: { delay: 0.15 + i * 0.12, duration: 0.45, ease: EASE },
});

function TicketVisual({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-[var(--lp-ink-3)]">
        <Ticket size={16} className="text-[var(--lp-violet)]" />
        <span className="lp-mono">{step.ticketId}</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight">
        {step.ticketTitle}
      </div>
      <div className="flex flex-wrap gap-2">
        {step.ticketMeta?.map((meta, i) => (
          <motion.span
            key={meta}
            {...listItem(i)}
            className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs text-[var(--lp-ink-2)]"
          >
            {meta}
          </motion.span>
        ))}
      </div>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.5, duration: 1.2, ease: EASE }}
        className="lp-gradient-bg h-1 origin-left rounded-full"
      />
    </div>
  );
}

function InvestigateVisual({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-3">
      {step.plan?.map((line, i) => (
        <motion.div
          key={line}
          {...listItem(i)}
          className="flex items-start gap-3 rounded-xl bg-[#f8fafc] px-4 py-3 text-sm"
        >
          <span className="lp-mono text-[var(--lp-primary)]">{i + 1}</span>
          {line}
        </motion.div>
      ))}
      <motion.div
        {...listItem(5)}
        className="flex items-start gap-3 rounded-xl border border-[rgba(91,108,240,0.25)] bg-[rgba(91,108,240,0.06)] px-4 py-3 text-sm text-[#3b47b8]"
      >
        <CircleHelp size={16} className="mt-0.5 shrink-0" />
        {step.question}
      </motion.div>
    </div>
  );
}

function WorkVisual({ step }: { step: Step }) {
  return (
    <div className="lp-mono flex flex-col gap-2 rounded-2xl bg-[#f8fafc] p-5 text-[13px] ring-1 ring-[var(--lp-line)]">
      {step.lines?.map((line, i) => (
        <motion.div
          key={line}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + i * 0.25 }}
          className={
            line.startsWith("$")
              ? "text-[var(--lp-ink)]"
              : line.startsWith("edit")
                ? "text-[var(--lp-primary)]"
                : line.startsWith("Tests")
                  ? "text-[var(--lp-green)]"
                  : "text-[var(--lp-ink-3)]"
          }
        >
          {line}
        </motion.div>
      ))}
      <span className="lp-caret mt-1" />
    </div>
  );
}

function ReviewVisual({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-4">
      {step.checks?.map((check, i) => (
        <motion.div
          key={check}
          {...listItem(i)}
          className="flex items-center gap-3 text-sm"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(18,161,80,0.12)] text-[var(--lp-green)]">
            <Check size={14} />
          </span>
          {check}
        </motion.div>
      ))}
      <motion.div {...listItem(4)} className="mt-2 flex flex-wrap gap-3">
        <span className="lp-btn bg-[var(--lp-green)] px-5 py-2.5 text-sm text-[#fff]">
          <GitMerge size={15} />
          {step.approve}
        </span>
        <span className="lp-btn lp-btn-ghost px-5 py-2.5 text-sm">
          {step.request}
        </span>
      </motion.div>
    </div>
  );
}

const VISUALS: Record<StoryVisual, React.FC<{ step: Step }>> = {
  ticket: TicketVisual,
  investigate: InvestigateVisual,
  work: WorkVisual,
  review: ReviewVisual,
};

/**
 * Pinned, four-chapter walkthrough. The section is four screens tall; the
 * content stays put while the scroll position picks the active chapter.
 */
export function LandingStory() {
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [active, setActive] = React.useState(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(
      STORY.steps.length - 1,
      Math.floor(v * STORY.steps.length),
    );
    setActive(next);
  });

  const step = STORY.steps[active];
  const Visual = VISUALS[step.visual];

  return (
    <section id="how" ref={ref} className="relative h-[420vh]">
      <div className="sticky top-0 flex h-screen items-center px-4 pt-16 md:px-6 md:pt-0">
        <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[1fr_1.1fr] md:gap-16">
          <div className="flex flex-col justify-center">
            <span className="lp-eyebrow">{STORY.eyebrow}</span>
            <h2 className="mt-4 text-[clamp(1.9rem,4vw,3.2rem)] leading-[1.05] font-semibold tracking-[-0.035em]">
              {STORY.title}
            </h2>
            <div className="relative mt-10 hidden gap-5 md:flex">
              <div className="relative w-[2px] shrink-0 rounded-full bg-[var(--lp-line)]">
                <motion.div
                  className="lp-gradient-bg absolute inset-x-0 top-0 h-full origin-top rounded-full"
                  style={{ scaleY: bar }}
                />
              </div>
              <ol className="flex flex-col gap-3 md:gap-5">
                {STORY.steps.map((s, i) => (
                  <li
                    key={s.number}
                    className={`transition-all duration-500 ${
                      i === active ? "opacity-100" : "opacity-35"
                    }`}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="lp-mono text-xs text-[var(--lp-primary)]">
                        {s.number}
                      </span>
                      <span className="text-[16px] font-semibold md:text-lg">
                        {s.title}
                      </span>
                    </div>
                    <div
                      className={`grid transition-all duration-500 ${
                        i === active
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <p className="overflow-hidden pt-1.5 pl-8 text-sm leading-relaxed text-[var(--lp-ink-2)] md:text-[15px]">
                        {s.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="relative flex items-center">
            <div
              aria-hidden
              className="lp-blob"
              style={{
                width: 380,
                height: 380,
                right: -60,
                top: -40,
                background: "#bfeaf6",
              }}
            />
            <div className="lp-card relative min-h-[300px] w-full p-6 md:min-h-[380px] md:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.visual}
                  initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -24, filter: "blur(6px)" }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <div className="mb-6 flex items-center gap-2">
                    <span className="lp-mono rounded-md bg-[rgba(11,129,183,0.08)] px-2 py-0.5 text-xs text-[var(--lp-primary)]">
                      {step.number}
                    </span>
                    <span className="text-sm font-medium text-[var(--lp-ink-2)]">
                      {step.title}
                    </span>
                  </div>
                  <p className="mb-5 text-sm leading-relaxed text-[var(--lp-ink-2)] md:hidden">
                    {step.description}
                  </p>
                  <Visual step={step} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
