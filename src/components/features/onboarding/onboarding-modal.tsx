import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { I18nKey } from "#/i18n/declaration";
import { useTracking } from "#/hooks/use-tracking";
import { ProjectIntakeStep } from "./steps/project-intake-step";

/**
 * sessionStorage flag marking that the one-time "onboarding started" analytics
 * event has already been captured for this browser session.
 */
const ONBOARDING_STARTED_TRACKED_KEY = "neo-onboarding-started";

interface OnboardingModalProps {
  /** Called when the user dismisses the modal (skip / X / launch). */
  onClose: () => void;
  /** Unused — kept for OnboardingHost's preview-step query param compat. */
  initialStep?: number;
  /** When true, does not persist onboarding completion. */
  isPreview?: boolean;
}

/**
 * Neo onboarding: a single question ("what are you building?"), no
 * agent/model choice surfaced to the user. Agent and LLM are auto-resolved in
 * the background (default agent profile; Gemini LLM profile seeded by
 * useSeedGeminiDefaultProfile in root.tsx) — onboarding only "starts" once
 * the user has described their project, which immediately launches a real
 * conversation seeded with that context.
 */
export function OnboardingModal({
  onClose,
  isPreview = false,
}: OnboardingModalProps) {
  const { t } = useTranslation("openhands");
  const { trackOnboardingStarted, trackOnboardingCompleted } = useTracking();

  // Consent is enforced centrally by the shared PostHog client (see
  // `telemetry.ts`/`useSyncTelemetryConsent`) -- gating this capture on a
  // `useSettings()` snapshot (as this used to do via
  // `user_consents_to_analytics`) violates that rule (see `useTracking`'s own
  // doc comment) and is a real race on top of it: on a genuinely fresh
  // install the settings query is still loading when this modal first mounts,
  // so the stale/undefined snapshot read as "no consent" and could suppress
  // `onboarding_started` for good if the user finished the one-question flow
  // before settings resolved -- while the ungated `trackOnboardingCompleted`
  // below fired every time regardless. Only `isPreview` (a design-review
  // render, not a real session) and the once-per-session dedupe guard this
  // event.
  const startedTrackedRef = React.useRef(false);
  React.useEffect(() => {
    if (isPreview || startedTrackedRef.current) return;
    if (window.sessionStorage.getItem(ONBOARDING_STARTED_TRACKED_KEY)) return;
    startedTrackedRef.current = true;
    window.sessionStorage.setItem(ONBOARDING_STARTED_TRACKED_KEY, "1");
    trackOnboardingStarted();
  }, [isPreview]);

  const handleLaunched = () => {
    trackOnboardingCompleted({ agent: "openhands" });
    onClose();
  };

  return (
    <ModalBackdrop
      aria-label={t(I18nKey.ONBOARDING$TITLE)}
      closeOnEscape={false}
      closeOnBackdropClick={false}
    >
      <section
        data-testid="onboarding-modal"
        data-preview={isPreview ? "true" : undefined}
        className="flex max-h-[90vh] w-[min(90vw,720px)] flex-col overflow-y-auto rounded-2xl border border-white/10 bg-base-secondary shadow-2xl"
      >
        <ProjectIntakeStep onLaunched={handleLaunched} />
      </section>
    </ModalBackdrop>
  );
}
