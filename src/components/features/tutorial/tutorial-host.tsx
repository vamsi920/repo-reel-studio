import React from "react";
import { useOnboardingCompletion } from "#/components/features/onboarding/use-onboarding-completion";
import { readTutorialSeen, useTutorialStore } from "./tutorial-store";
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
  const { isCompleted: onboardingCompleted } = useOnboardingCompletion();
  const wasOnboardedAtMountRef = React.useRef(onboardingCompleted);
  const autoStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (wasOnboardedAtMountRef.current) return;
    if (autoStartedRef.current || !onboardingCompleted) return;
    if (readTutorialSeen()) return;
    autoStartedRef.current = true;
    start();
  }, [onboardingCompleted, start]);

  return isOpen ? <TutorialWizard /> : <TutorialLauncher />;
}
