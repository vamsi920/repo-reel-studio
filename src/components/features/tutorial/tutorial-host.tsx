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
import { TutorialLaunchMenu } from "./tutorial-launch-menu";
import { useAiGuideStore } from "./ai-guide/ai-guide-store";
import { AiGuideHost } from "./ai-guide/ai-guide-host";

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
  const { trackTutorialStarted, trackAiGuideStarted } = useTracking();
  const isMenuOpen = useAiGuideStore((state) => state.isMenuOpen);
  const isAiGuideOpen = useAiGuideStore((state) => state.isOpen);
  const openMenu = useAiGuideStore((state) => state.openMenu);
  const closeMenu = useAiGuideStore((state) => state.closeMenu);
  const openAiGuide = useAiGuideStore((state) => state.open);
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
    closeMenu();
    start();
    trackTutorialStarted({ trigger: "launcher" });
  }, [start, closeMenu]);

  // The launcher now opens a small menu: ask the AI guide, or take the
  // static product tour.
  const toggleMenu = React.useCallback(() => {
    if (useAiGuideStore.getState().isMenuOpen) closeMenu();
    else openMenu();
  }, [openMenu, closeMenu]);

  const askAiGuide = React.useCallback(
    (query: string, source: "suggestion" | "typed") => {
      openAiGuide(query);
      trackAiGuideStarted({ source });
    },
    [openAiGuide],
  );

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
      <TutorialLauncher onStart={toggleMenu} inert={isOpen || isAiGuideOpen} />
      {isMenuOpen && !isOpen && !isAiGuideOpen ? (
        <TutorialLaunchMenu
          onAsk={askAiGuide}
          onProductTour={startFromLauncher}
          onClose={closeMenu}
        />
      ) : null}
      {isOpen ? <TutorialWizard /> : null}
      <AiGuideHost onProductTour={startFromLauncher} />
    </>
  );
}
