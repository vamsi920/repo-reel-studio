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
 * A pinned manifesto whose words light up one by one as the page scrolls
 * past it.
 */
export function LandingStatement() {
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const words = STATEMENT.text.split(" ").map((raw) => ({
    word: raw.replace(/\*/g, ""),
    accent: raw.includes("*"),
  }));
  const step = 0.85 / words.length;

  return (
    <section ref={ref} className="relative h-[260vh]">
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
                range={[0.05 + i * step, 0.05 + (i + 1) * step]}
              />
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
