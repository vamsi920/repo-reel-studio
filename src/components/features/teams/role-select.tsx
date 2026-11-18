import { useTranslation } from "react-i18next";
import type { TeamRole } from "#/lib/teams/types";
import { cn } from "#/utils/utils";
import { ROLE_LABEL_KEY, teamFieldClassName } from "./team-labels";

interface RoleSelectProps<R extends TeamRole> {
  value: R;
  /** Roles on offer. `value` is always listed, even when not in here. */
  options: readonly R[];
  onChange: (role: R) => void;
  ariaLabel: string;
  testId?: string;
  isDisabled?: boolean;
  className?: string;
}

/** A native select: keyboard and screen-reader behaviour for free. */
export function RoleSelect<R extends TeamRole>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
  isDisabled,
  className,
}: RoleSelectProps<R>) {
  const { t } = useTranslation("openhands");
  const listed = options.includes(value) ? options : [value, ...options];

  return (
    <select
      data-testid={testId}
      aria-label={ariaLabel}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.value as R)}
      className={cn(
        teamFieldClassName,
        "w-auto min-w-[8rem] py-1.5",
        className,
      )}
    >
      {listed.map((role) => (
        <option key={role} value={role}>
          {t(ROLE_LABEL_KEY[role])}
        </option>
      ))}
    </select>
  );
}
