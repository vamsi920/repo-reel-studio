import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { I18nKey } from "#/i18n/declaration";
import { useSettings } from "#/hooks/query/use-settings";
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
  const { data: settings } = useSettings();
  const analyticsEnabled = settings?.user_consents_to_analytics === true;
  const { trackOnboardingStarted, trackOnboardingCompleted } = useTracking();

  const startedTrackedRef = React.useRef(false);
  React.useEffect(() => {
    if (isPreview || !analyticsEnabled || startedTrackedRef.current) return;
    if (window.sessionStorage.getItem(ONBOARDING_STARTED_TRACKED_KEY)) return;
    startedTrackedRef.current = true;
    window.sessionStorage.setItem(ONBOARDING_STARTED_TRACKED_KEY, "1");
    trackOnboardingStarted();
  }, [isPreview, analyticsEnabled]);

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
