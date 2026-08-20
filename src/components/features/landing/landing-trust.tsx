import { CheckCircle2 } from "lucide-react";
import { TRUST } from "./landing-copy";
import { LandingDiffMockup } from "./landing-diff-mockup";

export function LandingTrust() {
  return (
    <section className="bg-[var(--primary-700)] px-6 py-20">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex max-w-lg flex-col items-start gap-6">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary-300)]">
            {TRUST.eyebrow}
          </span>
          <h2 className="text-3xl font-semibold text-[rgba(245,249,252,0.96)]">
            {TRUST.title}
          </h2>
          <ul className="flex flex-col gap-5">
            {TRUST.items.map((item) => (
              <li key={item.title} className="flex gap-3">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-[var(--primary-300)]"
                  aria-hidden
                />
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-[rgba(245,249,252,0.96)]">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[rgba(245,249,252,0.72)]">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex w-full justify-center lg:justify-end">
          <LandingDiffMockup />
        </div>
      </div>
    </section>
  );
}
