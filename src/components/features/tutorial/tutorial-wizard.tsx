import React from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { cn } from "#/utils/utils";
import { useTracking } from "#/hooks/use-tracking";
import { useSidebarMobileNav } from "#/components/features/sidebar/sidebar-mobile-nav-context";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { getTutorialSteps, MOBILE_MENU_TOGGLE_TEST_ID } from "./tutorial-steps";
import { getCaptionDurationMs, useTutorialStore } from "./tutorial-store";
import { useTutorialAnchorRect } from "./tutorial-spotlight";
import { TutorialBubbleFrame } from "./tutorial-bubble";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

// The wizard is intentionally non-modal (`aria-modal="false"`) so its global
// arrow-key/Escape listener keeps working no matter where focus sits on the
// page. But a real blocking modal (Manage Backends, Add Backend, the
// onboarding modal — anything rendered through `ModalBackdrop`, which sets
// `aria-modal="true"`) can open on top of a running tour, since nothing
// about the tour prevents the rest of the app shell from being interacted
// with. Without this check, Escape pressed on a non-input control inside
// that modal (or arrow keys used to navigate one) would both close the
// modal *and* skip/advance the tour underneath it — the keystroke was meant
// for the modal alone.
function isInsideBlockingModal(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * Whether `path` is the step's own page or a sub-page of it (a specific
 * conversation under "/conversations", "/settings/llm", a specific run
 * under "/agentops/runs/:id", …). Used both to decide whether the tour's own
 * navigation should force the exact route, and to detect when a user has
 * left the current step's section entirely via some other in-app link.
 */
function isWithinStepRoute(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`);
}

/**
 * The guided tour itself: a spotlight ring around the element a step talks
 * about, plus a tip bubble beside it (centered when the step has nothing to
 * point at, docked to an edge on phones) with a title and a one-line tip.
 * Both glide from target to target. Each step navigates to the page it
 * describes so the user sees it behind the tip.
 * Arrow keys move between steps; Escape skips the tour. In "watch" mode the
 * captions advance on their own, each held long enough to read, and stop on
 * the last step so the user finishes deliberately.
 */
export function TutorialWizard() {
  const { t } = useTranslation("openhands");
  const { currentPath, navigate } = useNavigation();
  const steps = React.useMemo(() => getTutorialSteps(), []);
  const stepIndex = useTutorialStore((state) => state.stepIndex);
  const goTo = useTutorialStore((state) => state.goTo);
  const closeTour = useTutorialStore((state) => state.close);
  const { trackTutorialCompleted, trackTutorialSkipped } = useTracking();
  const isPlaying = useTutorialStore((state) => state.isPlaying);
  const setPlaying = useTutorialStore((state) => state.setPlaying);
  const {
    isOpen: isMobileNavOpen,
    open: openMobileNav,
    close: closeMobileNav,
  } = useSidebarMobileNav();

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const subtitle = t(step.subtitleKey);
  const points = (step.pointKeys ?? []).map((key) => t(key));
  const tone = step.tone ?? "light";
  // Watch mode holds each step long enough to read the points too.
  const captionDurationMs = getCaptionDurationMs(
    [subtitle, ...points].join(" "),
  );

  React.useEffect(() => {
    if (step.route && !isWithinStepRoute(currentPath, step.route)) {
      navigate(step.route);
    }
    // Only react to step changes: the user may browse away mid-step.
  }, [step.id]);

  // Sidebar links (and any other in-app link) keep working while the tour is
  // open, so a user can navigate away from the step's page on their own —
  // not through Back/Next or the effect above. Left unhandled, the caption
  // and spotlight stayed keyed to a step whose page was no longer on screen.
  // Detect exactly that transition — the route WAS within the active step's
  // section and now suddenly isn't — and resync: jump to whichever step (if
  // any) actually owns the page the user landed on, so the caption always
  // matches what's behind it. Staying inside the current step's own
  // sub-pages isn't a departure worth resyncing for (see `isWithinStepRoute`).
  const previousPathRef = React.useRef(currentPath);
  React.useEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = currentPath;
    if (!step.route) return; // welcome/finish narrate wherever the user is
    const wasInSync = isWithinStepRoute(previousPath, step.route);
    const isStillInSync = isWithinStepRoute(currentPath, step.route);
    if (!wasInSync || isStillInSync) return;
    const matchIndex = steps.findIndex(
      (s) => s.route != null && isWithinStepRoute(currentPath, s.route),
    );
    if (matchIndex !== -1) goTo(matchIndex, steps.length);
    // Nowhere the tour narrates: stop auto-advancing so it doesn't yank the
    // user away from a page they just chose to look at.
    else if (isPlaying) setPlaying(false);
  }, [currentPath]);

  // On a phone the sidebar itself is off-screen until the drawer is open, so
  // every step that spotlights a real sidebar link (marked by its hamburger
  // fallback — unlike in-page steps or "welcome"/"finish") opens the drawer for
  // the duration of that step — letting the spotlight ring the actual link
  // instead of falling back to the hamburger button. Sidebar.tsx's own
  // close-on-navigate effect steps aside while the tour is open (see the
  // comment there) so this doesn't get undone the instant the tour
  // navigates. Closed again on the last cleanup when the tour itself ends.
  React.useEffect(() => {
    if (step.anchorTestIds?.includes(MOBILE_MENU_TOGGLE_TEST_ID)) {
      openMobileNav();
    } else closeMobileNav();
  }, [step.id, openMobileNav, closeMobileNav]);

  React.useEffect(() => () => closeMobileNav(), [closeMobileNav]);

  // Closing the drawer here (not just in the unmount-cleanup effect below)
  // matters for timing: React 18 batches this with the closeTour() state
  // update that follows in the same tick, so the mobile-nav context and the
  // tour's own isOpen flip to their closed values in one render. Left to the
  // unmount effect alone, TutorialLauncher would mount first with the still-
  // stale (open) mobile-nav value, render nothing (see its own guard), and
  // TutorialHost's focus-back-to-launcher effect would find no button to
  // focus — silently dropping keyboard/screen-reader focus on close whenever
  // the tour ended on a routed step that had opened the drawer.
  const finish = React.useCallback(() => {
    trackTutorialCompleted({ totalSteps: steps.length });
    closeMobileNav();
    closeTour();
  }, [closeMobileNav, closeTour, steps.length]);

  const skip = React.useCallback(() => {
    trackTutorialSkipped({
      step: step.id,
      stepIndex,
      totalSteps: steps.length,
    });
    closeMobileNav();
    closeTour();
  }, [closeMobileNav, closeTour, step.id, stepIndex, steps.length]);

  const goNext = React.useCallback(() => {
    if (isLast) finish();
    else goTo(stepIndex + 1, steps.length);
  }, [isLast, finish, goTo, stepIndex, steps.length]);

  const goBack = React.useCallback(() => {
    goTo(stepIndex - 1, steps.length);
  }, [goTo, stepIndex, steps.length]);

  // Manual Back/Next while playing restarts the timer for the new caption.
  React.useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setTimeout(() => {
      if (isLast) setPlaying(false);
      else goTo(stepIndex + 1, steps.length);
    }, captionDurationMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, isLast, stepIndex, steps.length, captionDurationMs]);

  const playToggleLabel = t(
    isPlaying ? I18nKey.TUTORIAL$PAUSE : I18nKey.TUTORIAL$PLAY,
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (isInsideBlockingModal(event.target)) return;
      if (event.key === "ArrowRight") goNext();
      else if (event.key === "ArrowLeft") goBack();
      else if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goBack, skip]);

  const anchorRect = useTutorialAnchorRect({
    anchorTestIds: step.anchorTestIds,
    // The mobile drawer's own backdrop tap / close button can dismiss it
    // independent of the tour (see the comment on `remeasureKey` in
    // tutorial-spotlight.tsx); bumping this on every open/closed flip makes
    // the spotlight re-search instead of staying stuck on the anchor that
    // just disappeared.
    remeasureKey: isMobileNavOpen,
  });
  const titleId = "tutorial-wizard-title";
  const subtitleId = "tutorial-wizard-subtitle";

  return (
    <TutorialBubbleFrame
      anchorRect={anchorRect}
      tone={tone}
      contentKey={step.id}
      labelledBy={titleId}
      describedBy={subtitleId}
      dataAttributes={{ "data-step": step.id }}
    >
      {(palette) => (
        <>
          <div className="flex items-center justify-between gap-3">
            {/* Own live region: the "N of M" count changes on every step just
              like the title/subtitle, but it lives in the header row rather
              than the title/subtitle wrapper below, so without its own
              aria-live it silently updated with no announcement at all. */}
            <span
              data-testid="tutorial-progress"
              aria-live="polite"
              aria-atomic="true"
              className={cn(
                "text-xs font-medium uppercase tracking-wide",
                palette.progress,
              )}
            >
              {t(I18nKey.TUTORIAL$STEP_PROGRESS, {
                current: stepIndex + 1,
                total: steps.length,
              })}
            </span>
            <button
              type="button"
              data-testid="tutorial-skip"
              onClick={skip}
              aria-label={t(I18nKey.TUTORIAL$SKIP)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                palette.muted,
              )}
            >
              {t(I18nKey.TUTORIAL$SKIP)}
              <X width={12} height={12} aria-hidden="true" />
            </button>
          </div>

          {/* A single atomic live region around both title and subtitle: only
            the subtitle used to be aria-live, so screen readers announced
            the narration but silently dropped the step's title on every
            Back/Next/auto-advance. Atomic so a step change reads as one
            utterance instead of two overlapping ones. */}
          <div
            data-testid="tutorial-step-live-region"
            aria-live="polite"
            aria-atomic="true"
          >
            <h2 id={titleId} className="mt-2 text-base font-semibold">
              {t(step.titleKey)}
            </h2>
            <p
              id={subtitleId}
              data-testid="tutorial-subtitle"
              className={cn("mt-1 text-sm leading-relaxed", palette.subtitle)}
            >
              {subtitle}
            </p>
            {points.length ? (
              <ul
                data-testid="tutorial-points"
                className="mt-2 flex flex-col gap-1.5"
              >
                {points.map((point) => (
                  <li
                    key={point}
                    className={cn(
                      "flex gap-2 text-[13px] leading-snug",
                      palette.point,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full",
                        palette.bullet,
                      )}
                    />
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {isPlaying ? (
            <div
              aria-hidden="true"
              className={cn(
                "mt-3 h-0.5 overflow-hidden rounded-full",
                palette.track,
              )}
            >
              <div
                key={step.id}
                data-testid="tutorial-caption-timer"
                className={cn(
                  "h-full origin-left motion-reduce:hidden",
                  palette.fill,
                )}
                style={{
                  animation: `tutorial-caption-progress ${captionDurationMs}ms linear forwards`,
                }}
              />
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            {/* One thin bar rather than a dot per step: with dozens of steps a
              dot row is wider than the bubble. */}
            <div
              aria-hidden="true"
              data-testid="tutorial-progress-bar"
              className={cn(
                "h-1.5 min-w-0 flex-1 overflow-hidden rounded-full",
                palette.dot,
              )}
            >
              <div
                data-testid="tutorial-progress-fill"
                className={cn(
                  "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
                  palette.dotActive,
                )}
                style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StyledTooltip content={playToggleLabel} placement="top">
                <button
                  type="button"
                  data-testid="tutorial-play-toggle"
                  onClick={() => setPlaying(!isPlaying)}
                  aria-label={playToggleLabel}
                  className={cn("rounded-lg p-2", palette.ghost)}
                >
                  {isPlaying ? (
                    <Pause width={14} height={14} aria-hidden="true" />
                  ) : (
                    <Play width={14} height={14} aria-hidden="true" />
                  )}
                </button>
              </StyledTooltip>
              {!isFirst ? (
                <button
                  type="button"
                  data-testid="tutorial-back"
                  onClick={goBack}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm",
                    palette.ghost,
                  )}
                >
                  {t(I18nKey.TUTORIAL$BACK)}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="tutorial-next"
                onClick={goNext}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the tour is user-initiated; focus the primary action so Enter advances.
                autoFocus
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium",
                  palette.primary,
                )}
              >
                {t(isLast ? I18nKey.TUTORIAL$FINISH : I18nKey.TUTORIAL$NEXT)}
              </button>
            </div>
          </div>
        </>
      )}
    </TutorialBubbleFrame>
  );
}
