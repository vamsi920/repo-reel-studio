import { Link } from "react-router";
import { LandingTerminal } from "./landing-terminal";
import { HERO } from "./landing-copy";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-20 md:pt-24 md:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--primary-bg-subtle),transparent)]"
      />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex max-w-xl flex-col items-start gap-6 text-left">
          <span className="ame-eyebrow">{HERO.eyebrow}</span>
          <h1 className="text-4xl font-semibold leading-tight text-[var(--text-primary)] md:text-5xl">
            {HERO.title}
          </h1>
          <p className="text-lg text-[var(--text-secondary)]">
            {HERO.subtitle}
          </p>
          <div className="flex flex-col items-start gap-2">
            <Link to="/conversations" className="ame-btn-primary ame-btn-lg">
              {HERO.cta}
            </Link>
            <span className="text-xs text-[var(--text-tertiary)]">
              {HERO.ctaSub}
            </span>
          </div>
        </div>
        <div className="flex w-full justify-center lg:justify-end">
          <LandingTerminal />
        </div>
      </div>
    </section>
  );
}
