import { useTranslation } from "react-i18next";
import { GraduationCap } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useSidebarMobileNav } from "#/components/features/sidebar/sidebar-mobile-nav-context";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

/** `data-testid` of the launcher button, so other modules can find and focus it without a prop-drilled ref. */
export const TUTORIAL_LAUNCHER_TEST_ID = "tutorial-launcher";

/**
 * Small tab pinned to the left edge of the screen that (re)starts the guided
 * tutorial for returning users. On a phone it sits just under the top bar
 * (both the standalone mobile nav bar and the conversation page's own
 * header are ~48px tall) instead of the screen's vertical center, so it
 * never sits on top of message text; on desktop it stays vertically
 * centered. It hides itself while the mobile nav drawer is open so it
 * doesn't peek out from behind it.
 */
export function TutorialLauncher({
  onStart,
  inert = false,
}: {
  onStart: () => void;
  /** While the tour runs the launcher is shown (the last step points at it) but not clickable. */
  inert?: boolean;
}) {
  const { t } = useTranslation("openhands");
  const { isOpen: isMobileNavOpen } = useSidebarMobileNav();
  const label = t(I18nKey.TUTORIAL$START);

  if (isMobileNavOpen) return null;

  return (
    <StyledTooltip content={label} placement="right">
      <button
        type="button"
        data-testid={TUTORIAL_LAUNCHER_TEST_ID}
        onClick={onStart}
        aria-label={label}
        disabled={inert}
        tabIndex={inert ? -1 : undefined}
        className="fixed left-0 top-16 z-[45] translate-y-0 md:top-1/2 md:-translate-y-1/2 rounded-r-lg border border-l-0 border-[var(--oh-border)] bg-base-secondary px-1.5 py-2 text-[var(--oh-muted)] shadow-md hover:text-white focus-visible:text-white"
      >
        <GraduationCap width={16} height={16} aria-hidden="true" />
      </button>
    </StyledTooltip>
  );
}
