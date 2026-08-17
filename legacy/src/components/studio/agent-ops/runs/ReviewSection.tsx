import type { ReactNode } from "react";

type ReviewSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function ReviewSection({ title, children, className }: ReviewSectionProps) {
  return (
    <section className={className}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  );
}
