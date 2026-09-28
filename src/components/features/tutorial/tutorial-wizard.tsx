import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { cn } from "#/utils/utils";
import { getTutorialSteps } from "./tutorial-steps";
import { useTutorialStore } from "./tutorial-store";
import { TutorialSpotlight } from "./tutorial-spotlight";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * The guided tour itself: a caption bar pinned to the bottom of the screen,
 * like video subtitles, narrating one area of the app per step. Each step
 * navigates to the page it describes so the user sees it behind the caption.
 * Arrow keys move between steps; Escape skips the tour.
 */
export function TutorialWizard() {
  const { t } = useTranslation("openhands");
  const { currentPath, navigate } = useNavigation();
  const steps = React.useMemo(() => getTutorialSteps(), []);
  const stepIndex = useTutorialStore((state) => state.stepIndex);
  const goTo = useTutorialStore((state) => state.goTo);
  const close = useTutorialStore((state) => state.close);

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  React.useEffect(() => {
    if (step.route && currentPath !== step.route) navigate(step.route);
    // Only react to step changes: the user may browse away mid-step.
  }, [step.id]);

  const goNext = React.useCallback(() => {
    if (isLast) close();
    else goTo(stepIndex + 1, steps.length);
  }, [isLast, close, goTo, stepIndex, steps.length]);

  const goBack = React.useCallback(() => {
    goTo(stepIndex - 1, steps.length);
  }, [goTo, stepIndex, steps.length]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight") goNext();
      else if (event.key === "ArrowLeft") goBack();
      else if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goBack, close]);

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
        className="fixed inset-x-0 bottom-4 z-[60] mx-auto w-[min(92vw,640px)] rounded-2xl border border-[var(--oh-border)] bg-black/85 px-5 py-4 text-white shadow-2xl backdrop-blur"
      >
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="tutorial-progress"
            className="text-xs uppercase tracking-wide text-[var(--oh-muted)]"
          >
            {t(I18nKey.TUTORIAL$STEP_PROGRESS, {
              current: stepIndex + 1,
              total: steps.length,
            })}
          </span>
          <button
            type="button"
            data-testid="tutorial-skip"
            onClick={close}
            aria-label={t(I18nKey.TUTORIAL$SKIP)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--oh-muted)] hover:bg-white/10 hover:text-white"
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
          {t(step.subtitleKey)}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((s, index) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === stepIndex ? "w-5 bg-white" : "w-1.5 bg-white/30",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
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
