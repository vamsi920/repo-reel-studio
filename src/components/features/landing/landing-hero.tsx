import React from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
import { LandingConsoleLink } from "./landing-console-link";
import { LandingProductWindow } from "./landing-product-window";
import { HERO } from "./landing-copy";

const EASE = [0.22, 1, 0.36, 1] as const;

function Words({ text, delay }: { text: string; delay: number }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden">
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, delay: delay + i * 0.06, ease: EASE }}
          >
            {word}
            {" "}
          </motion.span>
        </span>
      ))}
    </>
  );
}

/**
 * Headline that rises in word by word, then a product window that starts
 * tilted back in 3D and lays flat (and grows) as you scroll into it.
 */
export function LandingHero() {
  const reduce = useReducedMotion();
  const heroRef = React.useRef<HTMLElement>(null);
  const windowRef = React.useRef<HTMLDivElement>(null);

  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const { scrollYProgress: windowProgress } = useScroll({
    target: windowRef,
    offset: ["start end", "center center"],
  });
  const smooth = useSpring(windowProgress, { stiffness: 90, damping: 24 });

  const textY = useTransform(heroProgress, [0, 0.5], [0, -120]);
  const textOpacity = useTransform(heroProgress, [0, 0.35], [1, 0]);
  const rotateX = useTransform(smooth, [0, 1], [reduce ? 0 : 32, 0]);
  const scale = useTransform(smooth, [0, 1], [reduce ? 1 : 0.84, 1]);
  const windowY = useTransform(smooth, [0, 1], [reduce ? 0 : 60, 0]);

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden px-4 pt-36 pb-24 md:pt-44 md:pb-32"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="lp-grid-bg absolute inset-0" />
        <div
          className="lp-blob"
          style={{
            width: 560,
            height: 560,
            top: -180,
            left: "8%",
            background: "#9fe3f5",
          }}
        />
        <div
          className="lp-blob"
          style={{
            width: 520,
            height: 520,
            top: -120,
            right: "4%",
            background: "#c7cdfd",
            animationDelay: "-6s",
          }}
        />
        <div
          className="lp-blob"
          style={{
            width: 420,
            height: 420,
            top: 380,
            left: "38%",
            background: "#b8e6f2",
            animationDelay: "-12s",
          }}
        />
      </div>

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="mx-auto flex max-w-5xl flex-col items-center text-center"
      >
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="lp-eyebrow rounded-full border border-[var(--lp-line-strong)] bg-[rgba(255,255,255,0.70)] px-4 py-1.5 backdrop-blur"
        >
          <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-[var(--lp-cyan)]" />
          {HERO.eyebrow}
        </motion.span>

        <h1 className="mt-7 text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.98] font-semibold tracking-[-0.045em]">
          <span className="block">
            <Words text={HERO.titleLead} delay={0.1} />
          </span>
          <span className="lp-gradient-text block pb-2">
            <Words text={HERO.titleTail} delay={0.35} />
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--lp-ink-2)] md:text-xl"
        >
          {HERO.subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.85, ease: EASE }}
          className="mt-9 flex flex-col items-center gap-4"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LandingConsoleLink
              label={HERO.cta}
              className="lp-btn lp-btn-primary px-7 py-3.5 text-[16px]"
            />
            <a
              href="#how"
              className="lp-btn lp-btn-ghost px-7 py-3.5 text-[16px]"
            >
              {HERO.secondaryCta}
              <ArrowRight size={16} />
            </a>
          </div>
          <span className="text-sm text-[var(--lp-ink-3)]">{HERO.ctaSub}</span>
        </motion.div>
      </motion.div>

      <div
        ref={windowRef}
        className="mx-auto mt-20 max-w-6xl [perspective:1400px]"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          style={{ rotateX, scale, y: windowY, transformOrigin: "50% 0%" }}
        >
          <LandingProductWindow />
        </motion.div>
      </div>
    </section>
  );
}
