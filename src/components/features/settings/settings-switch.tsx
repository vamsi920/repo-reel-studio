import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { ToggleSwitchVisual } from "#/ui/toggle-switch";

interface SettingsSwitchProps {
  testId?: string;
  name?: string;
  onToggle?: (value: boolean) => void;
  defaultIsToggled?: boolean;
  isToggled?: boolean;
  isBeta?: boolean;
  isDisabled?: boolean;
  /** Whether the toggle sits before or after the label. Defaults to "left". */
  togglePosition?: "left" | "right";
}

export function SettingsSwitch({
  children,
  testId,
  name,
  onToggle,
  defaultIsToggled,
  isToggled: controlledIsToggled,
  isBeta,
  isDisabled,
  togglePosition = "left",
}: React.PropsWithChildren<SettingsSwitchProps>) {
  const { t } = useTranslation("openhands");
  const [isToggled, setIsToggled] = React.useState(defaultIsToggled ?? false);
  // Guards the resync effect below: once the user has flipped this switch
  // themselves, a `defaultIsToggled` prop change (a background settings
  // refetch, an unrelated save elsewhere invalidating the same query, etc.)
  // must not silently discard that in-progress, unsaved choice. Mirrors the
  // `*TouchedRef` pattern used for the same class of bug elsewhere in
  // Settings (e.g. `agent-settings.tsx`).
  const touchedRef = React.useRef(false);

  // Resync when the server value changes under us (a background refetch, a
  // change made in another tab, etc.) — otherwise the uncontrolled switch
  // keeps showing whatever it last rendered even after `defaultIsToggled`
  // moves on. Skipped once the user has touched the switch this session so
  // that resync can't clobber their unsaved edit.
  React.useEffect(() => {
    if (touchedRef.current) return;
    setIsToggled(defaultIsToggled ?? false);
  }, [defaultIsToggled]);

  const handleToggle = (value: boolean) => {
    if (isDisabled) return;
    touchedRef.current = true;
    setIsToggled(value);
    onToggle?.(value);
  };

  const input = (
    <input
      hidden
      data-testid={testId}
      name={name}
      type="checkbox"
      onChange={(e) => handleToggle(e.target.checked)}
      checked={controlledIsToggled ?? isToggled}
      disabled={isDisabled}
    />
  );

  const toggle = (
    <ToggleSwitchVisual enabled={controlledIsToggled ?? isToggled} />
  );

  const label =
    children || isBeta ? (
      <div className="flex items-center gap-1">
        <span className="text-sm">{children}</span>
        {isBeta && (
          <span className="text-[11px] leading-4 text-base font-[500] tracking-tighter bg-primary px-1 rounded-full">
            {t(I18nKey.BADGE$BETA)}
          </span>
        )}
      </div>
    ) : null;

  return (
    <label
      className={cn(
        "flex items-center gap-2",
        togglePosition === "right" ? "w-full justify-between" : "w-fit",
        isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      {input}
      {togglePosition === "right" ? (
        <>
          {label}
          {toggle}
        </>
      ) : (
        <>
          {toggle}
          {label}
        </>
      )}
    </label>
  );
}
