import React from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { Lock, ScrollText, ShieldCheck, Boxes } from "lucide-react";
import { TRUST, ZOOM } from "./landing-copy";

const ICONS = [ShieldCheck, Boxes, ScrollText, Lock];
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * "Nothing merges without you." grows from a small line to fill the screen
 * as it scrolls in, then the four guarantees rise underneath it.
 */
export function LandingTrust() {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 22 });
  const scale = useTransform(smooth, [0, 0.5], [0.55, 1]);
  const letterSpacing = useTransform(smooth, [0, 0.5], ["0.04em", "-0.045em"]);
  const tailOpacity = useTransform(smooth, [0.2, 0.45], [0, 1]);
  const captionY = useTransform(smooth, [0.25, 0.5], [30, 0]);

  return (
    <section id="trust" className="px-4 pt-32 pb-28 md:px-6">
      <div
        ref={ref}
        className="flex min-h-[70vh] flex-col items-center justify-center text-center"
      >
        <motion.h2
          style={{ scale, letterSpacing }}
          className="text-[clamp(3rem,10vw,8.5rem)] leading-[0.95] font-semibold"
        >
          <span className="block">{ZOOM.lead}</span>
          <motion.span
            style={{ opacity: tailOpacity }}
            className="lp-gradient-text block pb-3"
          >
            {ZOOM.tail}
          </motion.span>
        </motion.h2>
        <motion.p
          style={{ opacity: tailOpacity, y: captionY }}
          className="mt-8 max-w-xl text-lg text-[var(--lp-ink-2)] md:text-xl"
        >
          {ZOOM.caption}
        </motion.p>
      </div>

      <div className="mx-auto mt-16 max-w-6xl">
        <span className="lp-eyebrow">{TRUST.eyebrow}</span>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.items.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
                className="lp-card p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(11,129,183,0.08)] text-[var(--lp-primary)]">
                  <Icon size={19} />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-ink-2)]">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
