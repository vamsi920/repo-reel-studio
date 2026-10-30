import React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { LandingConsoleLink } from "./landing-console-link";
import { CTA_BAND } from "./landing-copy";

/** Closing band that expands from an inset card to near full-bleed. */
export function LandingCta() {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });
  const inset = useTransform(scrollYProgress, [0, 1], ["8%", "0%"]);
  const radius = useTransform(scrollYProgress, [0, 1], [56, 32]);

  return (
    <section className="px-3 pb-24 md:px-4">
      <motion.div
        ref={ref}
        style={{ marginLeft: inset, marginRight: inset, borderRadius: radius }}
        className="lp-gradient-bg relative overflow-hidden px-6 py-24 text-center text-[#fff] md:py-32"
      >
        <div
          aria-hidden
          className="lp-grid-bg absolute inset-0 opacity-30 [--lp-line:rgba(255,255,255,0.18)]"
        />
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-[clamp(2.2rem,5.5vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.04em]">
            {CTA_BAND.title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-[rgba(255,255,255,0.85)]">
            {CTA_BAND.subtitle}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <LandingConsoleLink
              label={CTA_BAND.cta}
              className="lp-btn bg-[#fff] px-8 py-4 text-[16px] text-[var(--lp-ink)] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]"
            />
            <a
              href="#how"
              className="lp-btn border border-[rgba(255,255,255,0.40)] px-8 py-4 text-[16px] text-[#fff] hover:bg-[rgba(255,255,255,0.10)]"
            >
              {CTA_BAND.secondary}
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
