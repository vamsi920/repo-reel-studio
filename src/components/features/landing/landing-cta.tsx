import { LandingConsoleLink } from "./landing-console-link";
import { CTA_BAND } from "./landing-copy";

export function LandingCta() {
  return (
    <section className="relative overflow-hidden px-6 py-24 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_50%,var(--primary-bg-subtle),transparent)]"
      />
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
        <h2 className="text-3xl font-semibold text-[var(--text-primary)]">
          {CTA_BAND.title}
        </h2>
        <p className="text-[var(--text-secondary)]">{CTA_BAND.subtitle}</p>
        <LandingConsoleLink
          label={CTA_BAND.cta}
          className="ame-btn-primary ame-btn-lg"
        />
      </div>
    </section>
  );
}
