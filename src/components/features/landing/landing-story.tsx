import React from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "framer-motion";
import {
  BookOpen,
  Check,
  Database,
  FlaskConical,
  GitMerge,
  PlayCircle,
  Repeat,
  Workflow,
} from "lucide-react";
import { STORY, StoryStep, StoryVisual } from "./landing-copy";

type Step = StoryStep;

const EASE = [0.22, 1, 0.36, 1] as const;

const listItem = (i: number) => ({
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  transition: { delay: 0.15 + i * 0.12, duration: 0.45, ease: EASE },
});

function LearnVisual({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-2.5">
      {step.items.map((item, i) => (
        <motion.div
          key={item}
          {...listItem(i)}
          className="flex items-center gap-3 rounded-xl bg-[#f8fafc] px-4 py-3 text-sm"
        >
          <BookOpen size={15} className="shrink-0 text-[var(--lp-primary)]" />
          {item}
        </motion.div>
      ))}
      <motion.div
        {...listItem(step.items.length)}
        className="mt-1 flex items-center gap-3 rounded-xl bg-[var(--lp-ink)] px-4 py-3 text-sm text-[#fff]"
      >
        <PlayCircle size={16} className="shrink-0" />
        {step.footer}
      </motion.div>
    </div>
  );
}

function BuildVisual({ step }: { step: Step }) {
  return (
    <div className="lp-mono flex flex-col gap-2 rounded-2xl bg-[#f8fafc] p-5 text-[13px] ring-1 ring-[var(--lp-line)]">
      {step.items.map((line, i) => (
        <motion.div
          key={line}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + i * 0.3 }}
          className={
            line.startsWith("$")
              ? "text-[var(--lp-ink)]"
              : "text-[var(--lp-primary)]"
          }
        >
          {line}
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 + step.items.length * 0.3 }}
        className="text-[var(--lp-green)]"
      >
        {step.footer}
      </motion.div>
      <span className="lp-caret mt-1" />
    </div>
  );
}

function ProveVisual({ step }: { step: Step }) {
  const icons = [FlaskConical, Database, Repeat];
  return (
    <div className="flex flex-col gap-3">
      {step.items.map((item, i) => {
        const Icon = icons[i % icons.length];
        return (
          <motion.div
            key={item}
            {...listItem(i)}
            className="flex items-center gap-3 rounded-xl border border-[var(--lp-line)] px-4 py-3 text-sm"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(18,161,80,0.1)] text-[var(--lp-green)]">
              <Icon size={15} />
            </span>
            {item}
            <Check
              size={16}
              className="ml-auto shrink-0 text-[var(--lp-green)]"
            />
          </motion.div>
        );
      })}
      <motion.div
        {...listItem(step.items.length)}
        className="text-sm text-[var(--lp-ink-3)]"
      >
        {step.footer}
      </motion.div>
    </div>
  );
}

function AutomateVisual({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-2.5">
      {step.items.map((item, i) => (
        <motion.div
          key={item}
          {...listItem(i)}
          className="flex items-center gap-3 rounded-xl bg-[#f8fafc] px-4 py-3 text-sm"
        >
          <Workflow size={15} className="shrink-0 text-[var(--lp-violet)]" />
          {item}
          <span className="lp-pulse ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--lp-green)]" />
        </motion.div>
      ))}
      <motion.div
        {...listItem(step.items.length)}
        className="lp-mono mt-1 truncate rounded-xl bg-[rgba(18,161,80,0.08)] px-4 py-3 text-[12px] text-[#067647]"
      >
        {step.footer}
      </motion.div>
    </div>
  );
}

function ControlVisual({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-4">
      {step.items.map((item, i) => (
        <motion.div
          key={item}
          {...listItem(i)}
          className="flex items-center gap-3 text-sm"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(18,161,80,0.12)] text-[var(--lp-green)]">
            <Check size={14} />
          </span>
          {item}
        </motion.div>
      ))}
      <motion.div {...listItem(step.items.length)} className="mt-2">
        <span className="lp-btn bg-[var(--lp-green)] px-5 py-2.5 text-sm text-[#fff]">
          <GitMerge size={15} />
          {step.footer}
        </span>
      </motion.div>
    </div>
  );
}

const VISUALS: Record<StoryVisual, React.FC<{ step: Step }>> = {
  learn: LearnVisual,
  build: BuildVisual,
  prove: ProveVisual,
  automate: AutomateVisual,
  control: ControlVisual,
};

/**
 * Pinned, five-chapter walkthrough. Each chapter gets about half a screen of scroll; the
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
    <section id="how" ref={ref} className="relative h-[360vh]">
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
                      {step.label}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold md:hidden">
                    {step.title}
                  </h3>
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
