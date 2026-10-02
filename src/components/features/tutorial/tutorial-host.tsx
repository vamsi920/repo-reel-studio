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
import {
  TUTORIAL_LAUNCHER_TEST_ID,
  TutorialLauncher,
} from "./tutorial-launcher";
import { TutorialWizard } from "./tutorial-wizard";
import { TutorialCloudAutoStart } from "./tutorial-cloud-auto-start";
import { TutorialSignInAutoStart } from "./tutorial-sign-in-auto-start";

/**
 * Mounts the guided tutorial. A new user — one who finishes the onboarding
 * flow in this session and has never finished or skipped the tour — gets it
 * automatically, once. So does a brand-new Cloud account whose ready LLM
 * skips onboarding (see `TutorialCloudAutoStart`), and so does a real user
 * signing in for the first time, on any browser (see
 * `TutorialSignInAutoStart`). Returning users are never interrupted; they
 * start it from the left-edge launcher.
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
  const wasOpenRef = React.useRef(isOpen);

  // The wizard replaces the launcher in the DOM while it's open; once it
  // closes (finish, skip, or Escape), send focus back to the launcher that
  // takes its place so keyboard/screen-reader users aren't left on a node
  // that just disappeared.
  React.useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      document
        .querySelector<HTMLButtonElement>(
          `[data-testid="${TUTORIAL_LAUNCHER_TEST_ID}"]`,
        )
        ?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

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

  // A first real sign-in is new-user evidence on its own, even on a browser
  // that was already onboarded or saw the tour under another account.
  const autoStartForSignedInUser = React.useCallback(() => {
    if (autoStartedRef.current || useTutorialStore.getState().isOpen) return;
    autoStartedRef.current = true;
    start();
    trackTutorialStarted({ trigger: "sign_in" });
  }, [start]);

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
      <TutorialSignInAutoStart onNewUser={autoStartForSignedInUser} />
      {watchForNewCloudUser && <TutorialCloudAutoStart onNewUser={autoStart} />}
      {/* The launcher stays mounted (inert) during the tour so the last step
          can point at it. */}
      <TutorialLauncher onStart={startFromLauncher} inert={isOpen} />
      {isOpen ? <TutorialWizard /> : null}
    </>
  );
}
