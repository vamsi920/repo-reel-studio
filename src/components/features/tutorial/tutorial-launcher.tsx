import { useTranslation } from "react-i18next";
import { GraduationCap } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useTutorialStore } from "./tutorial-store";

/**
 * Small tab pinned to the left edge of the screen that (re)starts the guided
 * tutorial for returning users.
 */
export function TutorialLauncher() {
  const { t } = useTranslation("openhands");
  const start = useTutorialStore((state) => state.start);
  const label = t(I18nKey.TUTORIAL$START);

  return (
    <button
      type="button"
      data-testid="tutorial-launcher"
      onClick={start}
      aria-label={label}
      title={label}
      className="fixed left-0 top-1/2 z-[45] -translate-y-1/2 rounded-r-lg border border-l-0 border-[var(--oh-border)] bg-base-secondary px-1.5 py-2 text-[var(--oh-muted)] shadow-md hover:text-white focus-visible:text-white"
    >
      <GraduationCap width={16} height={16} aria-hidden="true" />
    </button>
  );
}
