import React from "react";

interface UsageStatProps {
  label: string;
  value: string;
  /** Short clarification of what the number actually counts. */
  hint?: string;
}

/** One number with the sentence that says what it means. */
export function UsageStat({ label, value, hint }: UsageStatProps) {
  return (
    <div className="ame-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</div>
      ) : null}
    </div>
  );
}

interface UsageSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function UsageSection({
  title,
  description,
  children,
}: UsageSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function UsageStatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function UsageEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-color)] p-6 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  );
}
