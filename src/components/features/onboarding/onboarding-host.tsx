import { useLocation } from "react-router";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useSettings } from "#/hooks/query/use-settings";
import { hasUsableCloudLlm } from "./cloud-llm-readiness";
import { OnboardingModal } from "./onboarding-modal";
import {
  isOnboardingPreviewActive,
  readOnboardingPreviewStep,
} from "./onboarding-preview";
import { useOnboardingCompletion } from "./use-onboarding-completion";

/**
 * Mounts the onboarding modal automatically the first time the user
 * lands on a host route (i.e. when the localStorage onboarding flag
 * isn't set yet). Closing or completing the flow marks it done so the
 * modal won't re-appear on subsequent visits.
 *
 * An already-authenticated Cloud backend may provide everything onboarding
 * would collect. Once the active Cloud backend reports a usable LLM, suppress
 * the redundant modal without writing a fake completion marker. Local backends
 * remain browser-onboarding-driven.
 *
 * With `?previewOnboardingStep=<0-3>` the modal opens on that slide for
 * design review without persisting completion (works on any route when
 * mounted from the root layout).
 */
export function OnboardingHost() {
  const location = useLocation();
  const previewStep = readOnboardingPreviewStep(location.search);
  const isPreview = isOnboardingPreviewActive(location.search);
  const { isCompleted, markCompleted } = useOnboardingCompletion();
  const { backend } = useActiveBackend();
  const settings = useSettings();
  const isCloudBackend = backend.kind === "cloud";

  if (!isPreview) {
    if (isCompleted) return null;
    if (isCloudBackend && settings.isLoading) return null;
    if (isCloudBackend && hasUsableCloudLlm(settings.data)) {
      return null;
    }
  }

  const handleClose = () => {
    if (isPreview) return;
    markCompleted();
  };

  return (
    <OnboardingModal
      onClose={handleClose}
      initialStep={previewStep ?? 0}
      isPreview={isPreview}
    />
  );
}
