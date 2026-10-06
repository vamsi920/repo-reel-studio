import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useNavigation } from "#/context/navigation-context";
import { TextShimmer } from "#/components/shared/text-shimmer";
import { useTutorialElementRect } from "../tutorial-spotlight";
import { TutorialBubbleFrame } from "../tutorial-bubble";
import { useAiGuideStore, type AiGuideErrorKind } from "./ai-guide-store";

const ERROR_KEYS: Record<AiGuideErrorKind, I18nKey> = {
  signed_out: I18nKey.AI_GUIDE$ERROR_SIGNED_OUT,
  rate_limited: I18nKey.AI_GUIDE$ERROR_RATE_LIMITED,
  unavailable: I18nKey.AI_GUIDE$ERROR_UNAVAILABLE,
  failed: I18nKey.AI_GUIDE$ERROR_FAILED,
};

/** Security pages keep the static tour's dark tone in the AI guide too. */
const DARK_TONE_ROUTE = "/security";

/**
 * The AI guide's bubble: the same frame, spotlight, palette and motion as
 * the static product tour, showing whatever step the agent planned. Click
 * and type steps complete when the user does the thing (the agent is
 * listening); "I did it" covers a different path to the same result.
 */
export function AiGuideWizard({
  onAskAnother,
  onProductTour,
}: {
  onAskAnother: () => void;
  onProductTour: () => void;
}) {
  const { t } = useTranslation("openhands");
  const { currentPath } = useNavigation();
  const status = useAiGuideStore((state) => state.status);
  const step = useAiGuideStore((state) => state.step);
  const stepCount = useAiGuideStore((state) => state.stepCount);
  const errorKind = useAiGuideStore((state) => state.errorKind);
  const advance = useAiGuideStore((state) => state.advance);
  const close = useAiGuideStore((state) => state.close);

  const isPlanning = status === "planning";
  const isError = status === "error";
  const element = !isPlanning && !isError ? (step?.element ?? null) : null;
  const anchorRect = useTutorialElementRect(element);
  const tone =
    currentPath === DARK_TONE_ROUTE ||
    currentPath.startsWith(`${DARK_TONE_ROUTE}/`)
      ? "dark"
      : "light";

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const titleId = "ai-guide-title";
  const tipId = "ai-guide-tip";
  let title = step?.title ?? "";
  let tip = step?.tip ?? "";
  if (isError && errorKind) {
    title = t(I18nKey.AI_GUIDE$ERROR_TITLE);
    tip = t(ERROR_KEYS[errorKind]);
  }
  const contentKey = `${status}:${stepCount}`;
  const isDone = step?.kind === "done" && !isPlanning && !isError;
  const awaitsUserAction =
    !isPlanning &&
    !isError &&
    (step?.kind === "click" || step?.kind === "type");

  return (
    <TutorialBubbleFrame
      anchorRect={anchorRect}
      tone={tone}
      contentKey={contentKey}
      elevated
      labelledBy={titleId}
      describedBy={tipId}
      dataAttributes={{
        "data-mode": "ai",
        "data-status": status,
        "data-step-kind": step?.kind ?? "none",
      }}
    >
      {(palette) => (
        <>
          <div className="flex items-center justify-between gap-3">
            <span
              data-testid="tutorial-progress"
              aria-live="polite"
              aria-atomic="true"
              className={cn(
                "text-xs font-medium uppercase tracking-wide",
                palette.progress,
              )}
            >
              {t(I18nKey.AI_GUIDE$HEADER, { current: Math.max(stepCount, 1) })}
            </span>
            <button
              type="button"
              data-testid="tutorial-skip"
              onClick={close}
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

          <div
            data-testid="tutorial-step-live-region"
            aria-live="polite"
            aria-atomic="true"
          >
            {isPlanning && !step ? (
              <p
                id={tipId}
                data-testid="ai-guide-thinking"
                className={cn("mt-2 text-sm", palette.subtitle)}
              >
                <TextShimmer>{t(I18nKey.AI_GUIDE$THINKING)}</TextShimmer>
              </p>
            ) : (
              <>
                <h2 id={titleId} className="mt-2 text-base font-semibold">
                  {title}
                </h2>
                <p
                  id={tipId}
                  data-testid="tutorial-subtitle"
                  className={cn(
                    "mt-1 text-sm leading-relaxed",
                    palette.subtitle,
                  )}
                >
                  {tip}
                </p>
                {awaitsUserAction ? (
                  <p className={cn("mt-2 text-[13px]", palette.point)}>
                    {t(
                      step?.kind === "type"
                        ? I18nKey.AI_GUIDE$TYPE_HINT
                        : I18nKey.AI_GUIDE$CLICK_HINT,
                    )}
                  </p>
                ) : null}
                {isPlanning ? (
                  <p
                    data-testid="ai-guide-thinking"
                    className={cn("mt-2 text-[13px]", palette.point)}
                  >
                    <TextShimmer>{t(I18nKey.AI_GUIDE$THINKING)}</TextShimmer>
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {isError || isDone ? (
              <button
                type="button"
                data-testid="ai-guide-ask-another"
                onClick={onAskAnother}
                className={cn("rounded-lg px-3 py-1.5 text-sm", palette.ghost)}
              >
                {t(I18nKey.AI_GUIDE$ASK_ANOTHER)}
              </button>
            ) : null}
            {isError ? (
              <button
                type="button"
                data-testid="ai-guide-product-tour"
                onClick={onProductTour}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium",
                  palette.primary,
                )}
              >
                {t(I18nKey.AI_GUIDE$TRY_PRODUCT_TOUR)}
              </button>
            ) : null}
            {awaitsUserAction ? (
              <button
                type="button"
                data-testid="ai-guide-did-it"
                onClick={advance}
                className={cn("rounded-lg px-3 py-1.5 text-sm", palette.ghost)}
              >
                {t(I18nKey.AI_GUIDE$DID_IT)}
              </button>
            ) : null}
            {!isPlanning && !isError && step?.kind === "explain" ? (
              <button
                type="button"
                data-testid="tutorial-next"
                onClick={advance}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the user asked for this guide; Enter continues.
                autoFocus
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium",
                  palette.primary,
                )}
              >
                {t(I18nKey.TUTORIAL$NEXT)}
              </button>
            ) : null}
            {isDone ? (
              <button
                type="button"
                data-testid="tutorial-next"
                // The runner closes the guide once the agent's run ends.
                onClick={advance}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- final step; Enter finishes.
                autoFocus
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium",
                  palette.primary,
                )}
              >
                {t(I18nKey.TUTORIAL$FINISH)}
              </button>
            ) : null}
          </div>
        </>
      )}
    </TutorialBubbleFrame>
  );
}
