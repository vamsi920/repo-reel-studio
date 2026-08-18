import { HOW_IT_WORKS } from "./landing-copy";

export function LandingHowItWorks() {
  return (
    <section className="border-y border-[var(--border-color)] bg-[var(--background-secondary)] px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex flex-col items-start gap-3">
          <span className="ame-eyebrow">{HOW_IT_WORKS.eyebrow}</span>
          <h2 className="text-3xl font-semibold text-[var(--text-primary)]">
            {HOW_IT_WORKS.title}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.steps.map((step) => (
            <div key={step.number} className="flex flex-col gap-2">
              <span className="font-mono text-sm font-semibold text-[var(--primary-500)]">
                {step.number}
              </span>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {step.title}
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
