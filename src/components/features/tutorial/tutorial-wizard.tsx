import React from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { cn } from "#/utils/utils";
import { useTracking } from "#/hooks/use-tracking";
import { useSidebarMobileNav } from "#/components/features/sidebar/sidebar-mobile-nav-context";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { getTutorialSteps } from "./tutorial-steps";
import { getCaptionDurationMs, useTutorialStore } from "./tutorial-store";
import { TutorialSpotlight } from "./tutorial-spotlight";

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
 * The guided tour itself: a caption bar pinned to the bottom of the screen,
 * like video subtitles, narrating one area of the app per step. Each step
 * navigates to the page it describes so the user sees it behind the caption.
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
  const { open: openMobileNav, close: closeMobileNav } = useSidebarMobileNav();

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const subtitle = t(step.subtitleKey);
  const captionDurationMs = getCaptionDurationMs(subtitle);

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
  // every step that spotlights a real sidebar link (as opposed to a step
  // like "welcome"/"finish" with nothing to highlight) opens the drawer for
  // the duration of that step — letting the spotlight ring the actual link
  // instead of falling back to the hamburger button. Sidebar.tsx's own
  // close-on-navigate effect steps aside while the tour is open (see the
  // comment there) so this doesn't get undone the instant the tour
  // navigates. Closed again on the last cleanup when the tour itself ends.
  React.useEffect(() => {
    if (step.anchorTestIds?.length) openMobileNav();
    else closeMobileNav();
  }, [step.id, openMobileNav, closeMobileNav]);

  React.useEffect(() => () => closeMobileNav(), [closeMobileNav]);

  const finish = React.useCallback(() => {
    trackTutorialCompleted({ totalSteps: steps.length });
    closeTour();
  }, [closeTour, steps.length]);

  const skip = React.useCallback(() => {
    trackTutorialSkipped({
      step: step.id,
      stepIndex,
      totalSteps: steps.length,
    });
    closeTour();
  }, [closeTour, step.id, stepIndex, steps.length]);

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

  const titleId = "tutorial-wizard-title";
  const subtitleId = "tutorial-wizard-subtitle";

  return (
    <>
      <TutorialSpotlight anchorTestIds={step.anchorTestIds} />
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        data-testid="tutorial-wizard"
        data-step={step.id}
        // This bar is a fixed video-caption overlay (black/white, like real
        // subtitles) independent of the active app color theme — including
        // the default light "deepsea" theme where --oh-muted/--oh-border
        // resolve to dark colors meant for light surfaces, not this black
        // bar. Every color inside it must stay a fixed white-based utility
        // rather than an --oh-* theme token, or it becomes unreadable.
        className="fixed inset-x-0 bottom-4 z-[60] mx-auto w-[min(92vw,640px)] rounded-2xl border border-white/15 bg-black/85 px-5 py-4 text-white shadow-2xl backdrop-blur"
      >
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="tutorial-progress"
            className="text-xs uppercase tracking-wide text-white/60"
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
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          >
            {t(I18nKey.TUTORIAL$SKIP)}
            <X width={12} height={12} aria-hidden="true" />
          </button>
        </div>

        <h2 id={titleId} className="mt-2 text-lg font-semibold">
          {t(step.titleKey)}
        </h2>
        <p
          id={subtitleId}
          data-testid="tutorial-subtitle"
          aria-live="polite"
          className="mt-1 text-base leading-relaxed text-white/90"
        >
          {subtitle}
        </p>

        {isPlaying ? (
          <div
            aria-hidden="true"
            className="mt-3 h-0.5 overflow-hidden rounded-full bg-white/15"
          >
            <div
              key={step.id}
              data-testid="tutorial-caption-timer"
              className="h-full origin-left bg-white/70 motion-reduce:hidden"
              style={{
                animation: `tutorial-caption-progress ${captionDurationMs}ms linear forwards`,
              }}
            />
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((s, index) => (
              <span
                key={s.id}
                data-testid="tutorial-progress-dot"
                className={cn(
                  "h-1.5 rounded-full transition-all motion-reduce:transition-none",
                  index === stepIndex ? "w-5 bg-white" : "w-1.5 bg-white/30",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <StyledTooltip content={playToggleLabel} placement="top">
              <button
                type="button"
                data-testid="tutorial-play-toggle"
                onClick={() => setPlaying(!isPlaying)}
                aria-label={playToggleLabel}
                className="rounded-lg p-2 hover:bg-white/10"
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
                className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10"
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
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-white/90"
            >
              {t(isLast ? I18nKey.TUTORIAL$FINISH : I18nKey.TUTORIAL$NEXT)}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
