import { STACK } from "./landing-copy";

/** Endless strip of the stacks and tools Neo works with. */
export function LandingMarquee() {
  const items = [...STACK.items, ...STACK.items];
  return (
    <section className="border-y border-[var(--lp-line)] bg-[rgba(255,255,255,0.60)] py-10">
      <p className="mb-6 text-center text-sm text-[var(--lp-ink-3)]">
        {STACK.eyebrow}
      </p>
      <div className="lp-marquee-mask overflow-hidden">
        <div className="lp-marquee gap-12 pr-12">
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              aria-hidden={i >= STACK.items.length}
              className="text-2xl font-semibold tracking-tight whitespace-nowrap text-[var(--lp-ink-3)]/80 md:text-3xl"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
