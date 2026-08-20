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
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900 tabular-nums dark:text-neutral-50">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </div>
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
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
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
    <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      {message}
    </div>
  );
}
