import type { KeyboardEvent, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "#/utils/utils";

interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  options: SegmentedToggleOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  testId?: string;
}

/**
 * Lightweight 2-state segmented control used for the files-tab toggles
 * ("Diff view" on/off, "Rich"/"Plain"). Kept local because the existing
 * shared switch components are heavier than what we need here.
 *
 * Follows the WAI-ARIA radio-group pattern: only the checked option is in
 * the tab order, and Arrow keys (plus Home/End) move the check — and focus —
 * to a sibling option.
 */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
}: SegmentedToggleProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const last = options.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(options[next].value);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
      className="inline-flex items-center rounded-md bg-[var(--oh-surface-raised)] p-0.5 text-xs"
    >
      {options.map((option, index) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            data-testid={
              testId ? `${testId}-option-${option.value}` : undefined
            }
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition-colors",
              isActive
                ? "bg-[var(--oh-interactive-hover)] text-white"
                : "text-[var(--oh-muted)] hover:text-white",
            )}
          >
            {option.icon ? (
              <span
                aria-hidden
                className="inline-flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5"
              >
                {option.icon}
              </span>
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
