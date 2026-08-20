import { Bot, TerminalSquare, ShieldCheck, Server } from "lucide-react";
import { FEATURES } from "./landing-copy";

const ICONS = [Bot, TerminalSquare, ShieldCheck, Server];

export function LandingFeatures() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex flex-col items-start gap-3">
          <span className="ame-eyebrow">{FEATURES.eyebrow}</span>
          <h2 className="text-3xl font-semibold text-[var(--text-primary)]">
            {FEATURES.title}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.items.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <div
                key={item.title}
                className="instrument-panel ame-card ame-card-interactive"
              >
                <div className="ame-card-body flex flex-col gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
