import React from "react";
import { motion, MotionValue, useScroll, useTransform } from "framer-motion";
import { STATEMENT } from "./landing-copy";

function Word({
  word,
  accent,
  progress,
  range,
}: {
  word: string;
  accent: boolean;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.12, 1]);
  return (
    <motion.span
      style={{ opacity }}
      className={`inline-block ${accent ? "lp-gradient-text" : ""}`}
    >
      {word}
      {" "}
    </motion.span>
  );
}

/**
 * A briefly pinned manifesto whose words light up one by one as it scrolls
 * into view.
 */
export function LandingStatement() {
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // Starts filling while the section is still rising into view and is
    // fully lit soon after it pins, so a quick scroll never skips it.
    offset: ["start 0.8", "end end"],
  });

  const words = STATEMENT.text.split(" ").map((raw) => ({
    word: raw.replace(/\*/g, ""),
    accent: raw.includes("*"),
  }));
  const step = 0.6 / words.length;

  return (
    <section ref={ref} className="relative h-[150vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center px-6">
        <div className="max-w-5xl">
          <span className="lp-eyebrow mb-8">{STATEMENT.eyebrow}</span>
          <p className="text-[clamp(1.9rem,4.6vw,3.9rem)] leading-[1.12] font-semibold tracking-[-0.03em]">
            {words.map(({ word, accent }, i) => (
              <Word
                key={`${word}-${i}`}
                word={word}
                accent={accent}
                progress={scrollYProgress}
                range={[i * step, i * step + 0.12]}
              />
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
