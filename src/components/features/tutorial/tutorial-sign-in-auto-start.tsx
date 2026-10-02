import React from "react";
import type { User } from "@supabase/supabase-js";
import { hasUsableCloudLlm } from "#/components/features/onboarding/cloud-llm-readiness";
import { useOnboardingCompletion } from "#/components/features/onboarding/use-onboarding-completion";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useSettings } from "#/hooks/query/use-settings";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import { markTutorialSeen, useTutorialStore } from "./tutorial-store";
import {
  hasUserSeenTutorial,
  markTutorialSeenForUser,
} from "./tutorial-user-flag";

/**
 * True once the onboarding modal is out of the way — either completed, or
 * suppressed because the active Cloud backend already has a usable LLM (the
 * same rule `OnboardingHost` uses). The tour waits for this so it never
 * opens underneath onboarding.
 */
function useOnboardingSettled(): boolean {
  const { isCompleted } = useOnboardingCompletion();
  const isCloudBackend = useActiveBackend().backend.kind === "cloud";
  const settings = useSettings();
  if (isCompleted) return true;
  return isCloudBackend && hasUsableCloudLlm(settings.data);
}

function SignedInUserTour({
  user,
  onNewUser,
}: {
  user: User;
  onNewUser: () => void;
}) {
  const isOpen = useTutorialStore((state) => state.isOpen);
  const onboardingSettled = useOnboardingSettled();
  const wasOpenRef = React.useRef(isOpen);
  const seen = hasUserSeenTutorial(user);

  // A user who already saw the tour (on any browser) also suppresses the
  // browser-level auto-start paths in `TutorialHost`.
  React.useEffect(() => {
    if (seen) markTutorialSeen();
  }, [seen]);

  React.useEffect(() => {
    if (!seen && onboardingSettled && !useTutorialStore.getState().isOpen) {
      onNewUser();
    }
  }, [seen, onboardingSettled, onNewUser]);

  // Finishing or skipping the tour — however it was started — is
  // remembered on the signed-in account.
  React.useEffect(() => {
    if (wasOpenRef.current && !isOpen) markTutorialSeenForUser(user);
    wasOpenRef.current = isOpen;
  }, [isOpen, user]);

  return null;
}

/**
 * Starts the guided tour the first time a real (non-anonymous) user signs
 * in, and remembers on their account once they finish or skip it. Renders
 * nothing for anonymous or signed-out sessions.
 */
export function TutorialSignInAutoStart({
  onNewUser,
}: {
  onNewUser: () => void;
}) {
  const { status, user } = useSupabaseSession();
  if (status !== "real" || !user) return null;
  return <SignedInUserTour key={user.id} user={user} onNewUser={onNewUser} />;
}
