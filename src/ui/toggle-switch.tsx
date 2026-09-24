import { cn } from "#/utils/utils";

interface ToggleSwitchVisualProps {
  enabled: boolean;
  className?: string;
}

/** Shared toggle track + thumb used by settings labels and automation controls. */
export function ToggleSwitchVisual({
  enabled,
  className,
}: ToggleSwitchVisualProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full border",
        "transition-colors duration-200 ease-in-out motion-reduce:transition-none",
        enabled
          ? "border-white bg-white"
          : "border-[var(--oh-border)] bg-surface-raised",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full",
          "transition-transform duration-200 ease-in-out motion-reduce:transition-none",
          enabled
            ? "translate-x-[21px] bg-base-secondary"
            : "translate-x-[2px] bg-[var(--oh-muted)]",
        )}
      />
    </span>
  );
}

interface ToggleSwitchProps {
  enabled: boolean;
  label: string;
  onToggle: () => void;
  /**
   * True while a toggle request for this switch is in flight. `enabled`
   * doesn't change until the request settles and the underlying data
   * refetches, so without this a rapid double-click fires a second,
   * redundant request computed from the same stale `enabled` value.
   */
  disabled?: boolean;
  className?: string;
}

export function ToggleSwitch({
  enabled,
  label,
  onToggle,
  disabled = false,
  className,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      aria-busy={disabled}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <ToggleSwitchVisual enabled={enabled} />
    </button>
  );
}
