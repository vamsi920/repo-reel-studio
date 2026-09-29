import React from "react";
import { useOnboardingCompletion } from "#/components/features/onboarding/use-onboarding-completion";
import { useTracking } from "#/hooks/use-tracking";
import {
  readTutorialProgress,
  readTutorialSeen,
  useTutorialStore,
} from "./tutorial-store";
import { getTutorialSteps } from "./tutorial-steps";
import { TutorialLauncher } from "./tutorial-launcher";
import { TutorialWizard } from "./tutorial-wizard";

/**
 * Mounts the guided tutorial. A new user — one who finishes the onboarding
 * flow in this session and has never finished or skipped the tour — gets it
 * automatically, once. Returning users (onboarding already done when the app
 * loaded) are never interrupted; they start it from the left-edge launcher.
 */
export function TutorialHost() {
  const isOpen = useTutorialStore((state) => state.isOpen);
  const start = useTutorialStore((state) => state.start);
  const resume = useTutorialStore((state) => state.resume);
  const { trackTutorialStarted } = useTracking();
  const { isCompleted: onboardingCompleted } = useOnboardingCompletion();
  const wasOnboardedAtMountRef = React.useRef(onboardingCompleted);
  const autoStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (useTutorialStore.getState().isOpen) return;
    const interruptedAt = readTutorialProgress(getTutorialSteps().length);
    if (interruptedAt === null) return;
    autoStartedRef.current = true;
    resume(interruptedAt);
    trackTutorialStarted({ trigger: "resume" });
  }, []);

  React.useEffect(() => {
    if (wasOnboardedAtMountRef.current) return;
    if (autoStartedRef.current || !onboardingCompleted) return;
    if (readTutorialSeen()) return;
    autoStartedRef.current = true;
    start();
    trackTutorialStarted({ trigger: "auto" });
  }, [onboardingCompleted, start]);

  const startFromLauncher = React.useCallback(() => {
    start();
    trackTutorialStarted({ trigger: "launcher" });
  }, [start]);

  return isOpen ? (
    <TutorialWizard />
  ) : (
    <TutorialLauncher onStart={startFromLauncher} />
  );
}
