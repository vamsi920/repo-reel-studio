import { PROBLEM } from "./landing-copy";

export function LandingProblem() {
  return (
    <section className="border-y border-[var(--border-color)] bg-[var(--background-secondary)] px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex flex-col items-start gap-3">
          <span className="ame-eyebrow">{PROBLEM.eyebrow}</span>
          <h2 className="max-w-2xl text-3xl font-semibold text-[var(--text-primary)]">
            {PROBLEM.title}
          </h2>
          <p className="max-w-2xl text-[var(--text-secondary)]">
            {PROBLEM.subtitle}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          {PROBLEM.items.map((item, i) => (
            <div
              key={item.title}
              className="flex gap-4 border-t border-[var(--border-color)] pt-5"
            >
              <span className="font-mono text-sm font-semibold text-[var(--text-tertiary)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {item.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
