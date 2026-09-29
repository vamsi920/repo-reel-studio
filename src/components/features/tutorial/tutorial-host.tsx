import React from "react";
import { useOnboardingCompletion } from "#/components/features/onboarding/use-onboarding-completion";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useTracking } from "#/hooks/use-tracking";
import {
  readTutorialProgress,
  readTutorialSeen,
  useTutorialStore,
} from "./tutorial-store";
import { getTutorialSteps } from "./tutorial-steps";
import { TutorialLauncher } from "./tutorial-launcher";
import { TutorialWizard } from "./tutorial-wizard";
import { TutorialCloudAutoStart } from "./tutorial-cloud-auto-start";

/**
 * Mounts the guided tutorial. A new user — one who finishes the onboarding
 * flow in this session and has never finished or skipped the tour — gets it
 * automatically, once. So does a brand-new Cloud account whose ready LLM
 * skips onboarding (see `TutorialCloudAutoStart`). Returning users (onboarding already done when the app
 * loaded) are never interrupted; they start it from the left-edge launcher.
 */
export function TutorialHost() {
  const isOpen = useTutorialStore((state) => state.isOpen);
  const start = useTutorialStore((state) => state.start);
  const resume = useTutorialStore((state) => state.resume);
  const { trackTutorialStarted } = useTracking();
  const { isCompleted: onboardingCompleted } = useOnboardingCompletion();
  const isCloudBackend = useActiveBackend().backend.kind === "cloud";
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

  const autoStart = React.useCallback(() => {
    if (wasOnboardedAtMountRef.current || autoStartedRef.current) return;
    if (useTutorialStore.getState().isOpen || readTutorialSeen()) return;
    autoStartedRef.current = true;
    start();
    trackTutorialStarted({ trigger: "auto" });
  }, [start]);

  React.useEffect(() => {
    if (onboardingCompleted) autoStart();
  }, [onboardingCompleted, autoStart]);

  const startFromLauncher = React.useCallback(() => {
    start();
    trackTutorialStarted({ trigger: "launcher" });
  }, [start]);

  const watchForNewCloudUser =
    isCloudBackend &&
    !wasOnboardedAtMountRef.current &&
    !autoStartedRef.current &&
    !isOpen;

  return (
    <>
      {watchForNewCloudUser && <TutorialCloudAutoStart onNewUser={autoStart} />}
      {isOpen ? (
        <TutorialWizard />
      ) : (
        <TutorialLauncher onStart={startFromLauncher} />
      )}
    </>
  );
}
