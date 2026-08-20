import { HOW_IT_WORKS } from "./landing-copy";
import { LandingTaskBoardMockup } from "./landing-task-board-mockup";

export function LandingHowItWorks() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex flex-col items-start gap-3">
          <span className="ame-eyebrow">{HOW_IT_WORKS.eyebrow}</span>
          <h2 className="text-3xl font-semibold text-[var(--text-primary)]">
            {HOW_IT_WORKS.title}
          </h2>
        </div>
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-start lg:gap-16">
          <div className="grid w-full max-w-lg grid-cols-1 gap-8 sm:grid-cols-2">
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
          <div className="flex w-full justify-center lg:justify-end">
            <LandingTaskBoardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
