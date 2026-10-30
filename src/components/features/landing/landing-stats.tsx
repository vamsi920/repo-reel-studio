import React from "react";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import { STATS } from "./landing-copy";

type Stat = (typeof STATS.items)[number];

function CountUp({ stat }: { stat: Stat }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  const format = (v: number) =>
    `${stat.prefix}${v.toFixed(stat.decimals)}${stat.suffix}`;

  React.useEffect(() => {
    const node = ref.current;
    if (!inView || !node) return undefined;
    if (reduce) {
      node.textContent = format(stat.value);
      return undefined;
    }
    const controls = animate(0, stat.value, {
      duration: 1.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [inView, reduce]);

  return <span ref={ref}>{format(0)}</span>;
}

export function LandingStats() {
  return (
    <section className="px-4 py-28 md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <span className="lp-eyebrow">{STATS.eyebrow}</span>
          <h2 className="mt-4 text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.05] font-semibold tracking-[-0.035em]">
            {STATS.title}
          </h2>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-[var(--lp-line)] bg-[var(--lp-line)] sm:grid-cols-2 lg:grid-cols-4">
          {STATS.items.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="flex flex-col bg-[#fff] p-7 md:p-8"
            >
              <span className="lp-gradient-text text-6xl font-semibold tracking-[-0.04em] tabular-nums">
                <CountUp stat={stat} />
              </span>
              <span className="mt-4 text-[16px] font-medium">{stat.label}</span>
              <span className="mt-2 text-sm leading-relaxed text-[var(--lp-ink-3)]">
                {stat.detail}
              </span>
            </motion.div>
          ))}
        </div>
        <p className="mt-5 text-xs text-[var(--lp-ink-3)]">{STATS.footnote}</p>
      </div>
    </section>
  );
}
