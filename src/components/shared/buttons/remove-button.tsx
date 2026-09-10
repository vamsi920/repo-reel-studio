import { cn } from "#/utils/utils";
import CloseIcon from "#/icons/close.svg?react";

interface RemoveButtonProps {
  onClick: () => void;
  className?: React.HTMLAttributes<HTMLDivElement>["className"];
  /** Accessible name — the button is icon-only, so it has none otherwise. */
  "aria-label"?: string;
}

export function RemoveButton({
  onClick,
  className,
  "aria-label": ariaLabel,
}: RemoveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "bg-[var(--oh-muted)] rounded-full w-5 h-5 flex items-center justify-center cursor-pointer",
        className,
      )}
    >
      <CloseIcon width={18} height={18} aria-hidden />
    </button>
  );
}
