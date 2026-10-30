import React from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { STUDIOS } from "./landing-copy";

/**
 * Pinned section whose cards travel sideways while the page scrolls down.
 * The section is as tall as the horizontal distance to travel, so one
 * screen of vertical scroll moves the strip one screen to the left.
 */
export function LandingStudios() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [distance, setDistance] = React.useState(0);

  React.useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      setDistance(Math.max(0, track.scrollWidth - window.innerWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 28 });
  const x = useTransform(smooth, [0, 1], [0, -distance]);

  return (
    <section
      id="studios"
      ref={sectionRef}
      className="relative bg-[#fff]"
      style={{ height: `calc(100vh + ${distance}px)` }}
    >
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden pt-14 md:pt-0">
        <div className="mx-auto mb-10 w-full max-w-6xl px-4 md:px-6">
          <span className="lp-eyebrow">{STUDIOS.eyebrow}</span>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-2xl text-[clamp(2rem,4.5vw,3.6rem)] leading-[1.04] font-semibold tracking-[-0.035em]">
              {STUDIOS.title}
            </h2>
            <span className="flex items-center gap-2 text-sm text-[var(--lp-ink-3)]">
              {STUDIOS.hint}
              <ArrowRight size={14} />
            </span>
          </div>
          <p className="mt-4 max-w-2xl text-lg text-[var(--lp-ink-2)]">
            {STUDIOS.subtitle}
          </p>
        </div>

        <motion.div
          ref={trackRef}
          style={{ x }}
          className="flex w-max gap-5 pr-[8vw] pl-4 md:pl-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]"
        >
          {STUDIOS.items.map((studio, i) => (
            <article
              key={studio.name}
              className="relative flex h-[min(52vh,420px)] w-[min(82vw,520px)] shrink-0 flex-col overflow-hidden rounded-[28px] border border-[var(--lp-line)] p-7 md:p-9"
              style={{
                background: `linear-gradient(160deg, ${studio.accent}14 0%, #ffffff 55%)`,
              }}
            >
              <div
                aria-hidden
                className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
                style={{ background: studio.accent }}
              />
              <span className="lp-mono relative text-xs text-[var(--lp-ink-3)]">
                {`0${i + 1}`}
              </span>
              <div
                className="relative mt-auto text-sm font-semibold tracking-wide uppercase"
                style={{ color: studio.accent }}
              >
                {studio.kicker}
              </div>
              <h3 className="relative mt-2 text-4xl font-semibold tracking-[-0.03em] md:text-5xl">
                {studio.name}
              </h3>
              <p className="relative mt-4 text-[15px] leading-relaxed text-[var(--lp-ink-2)]">
                {studio.description}
              </p>
              <div className="relative mt-6 flex flex-wrap gap-2">
                {studio.stats.map((stat) => (
                  <span
                    key={stat}
                    className="rounded-full bg-[rgba(255,255,255,0.80)] px-3 py-1 text-xs text-[var(--lp-ink-2)] ring-1 ring-[var(--lp-line)]"
                  >
                    {stat}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
