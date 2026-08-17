import { cn } from "@/lib/utils";

/** Subtle color/hover transitions; disabled when user prefers reduced motion. */
export const agentOpsTransitionClass =
  "motion-safe:transition-colors motion-safe:duration-150 motion-reduce:transition-none";

/** Width/opacity transitions for progress and labels. */
export const agentOpsTransitionSlowClass =
  "motion-safe:transition-[width,opacity] motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none";

export const agentOpsChevronClass =
  "motion-safe:transition-transform motion-safe:duration-150 motion-reduce:transition-none";

/** Spinner for explicit user actions (approve, refresh, start run). */
export const agentOpsSpinnerClass =
  "motion-safe:animate-spin motion-reduce:animate-none";

/** Static busy marker for operation strip / passive states (no pulse). */
export const agentOpsBusyDotClass = "h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300/85";

export const agentOpsOperationFadeClass =
  "motion-safe:transition-opacity motion-safe:duration-150 motion-reduce:transition-none";
