import type { ReactNode } from "react";

import { agentOpsFocusVisibleClass } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { AgentOpsSpinner } from "@/components/studio/agent-ops/shared/AgentOpsSpinner";
import { agentOpsActionMinWidth } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { AgentOpsStableLabel } from "@/components/studio/agent-ops/shared/AgentOpsStableLabel";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AgentOpsActionIntent = "primary" | "secondary" | "tertiary";

const INTENT_VARIANT: Record<AgentOpsActionIntent, ButtonProps["variant"]> = {
  primary: "default",
  secondary: "outline",
  tertiary: "ghost",
};

const INTENT_CLASS: Record<AgentOpsActionIntent, string> = {
  primary: "font-semibold shadow-sm shadow-primary/20",
  secondary: "border-border bg-muted/50 text-foreground/80 hover:bg-muted hover:text-foreground",
  tertiary: "text-muted-foreground hover:bg-muted/60 hover:text-foreground/80",
};

export type AgentOpsActionButtonProps = ButtonProps & {
  intent: AgentOpsActionIntent;
  disabledReason?: string | null;
  loading?: boolean;
  loadingLabel?: ReactNode;
  hintId?: string;
};

export function AgentOpsActionButton({
  intent,
  disabledReason,
  loading = false,
  loadingLabel,
  hintId,
  className,
  children,
  disabled,
  title,
  ...props
}: AgentOpsActionButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const resolvedTitle = isDisabled && disabledReason ? disabledReason : title;

  return (
    <Button
      {...props}
      variant={INTENT_VARIANT[intent]}
      disabled={isDisabled}
      title={resolvedTitle}
      aria-busy={loading || undefined}
      aria-describedby={isDisabled && disabledReason && hintId ? hintId : props["aria-describedby"]}
      className={cn(
        "gap-1.5",
        agentOpsFocusVisibleClass,
        INTENT_CLASS[intent],
        isDisabled && disabledReason && "disabled:opacity-100 disabled:text-muted-foreground",
        className,
      )}
    >
      <AgentOpsStableLabel
        loading={loading}
        loadingLabel={
          loading && loadingLabel ? (
            <>
              <AgentOpsSpinner className="h-3.5 w-3.5 shrink-0" />
              {loadingLabel}
            </>
          ) : undefined
        }
      >
        {children}
      </AgentOpsStableLabel>
    </Button>
  );
}

export function AgentOpsActionHint({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p id={id} className={cn("text-[10px] leading-4 text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export const agentOpsCardActionRowClass = "flex min-h-8 min-w-0 flex-wrap items-center gap-1.5 pt-0.5";

export const agentOpsCardPrimaryActionClass = cn(
  "h-8 min-w-0 w-full max-w-full flex-1 px-2.5 text-[11px] sm:w-auto sm:flex-none",
  "sm:min-w-[5.75rem]",
);

export const agentOpsCardSecondaryActionClass = cn(
  "h-8 min-w-0 w-full max-w-full flex-1 px-2.5 text-[11px] sm:w-auto sm:flex-none",
  "sm:min-w-[7.5rem]",
);

export const agentOpsCardTertiaryActionClass = cn(
  "h-8 min-w-0 max-w-full px-2 text-[11px] text-muted-foreground sm:min-w-[5.5rem]",
);
