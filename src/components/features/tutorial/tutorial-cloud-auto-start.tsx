import React from "react";
import { hasUsableCloudLlm } from "#/components/features/onboarding/cloud-llm-readiness";
import { useSettings } from "#/hooks/query/use-settings";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";

/**
 * A signed-in Cloud account that already has a working LLM skips onboarding
 * entirely, so the "just finished onboarding" trigger never fires for it.
 * Treat such a user as new — and start the tour once — only when their
 * account has no conversations yet; anyone with history is a returning user
 * and just gets the launcher. Rendered only for Cloud backends so local
 * stacks never pay for these queries.
 */
export function TutorialCloudAutoStart({
  onNewUser,
}: {
  onNewUser: () => void;
}) {
  const settings = useSettings();
  const cloudReady = hasUsableCloudLlm(settings.data);
  const conversations = usePaginatedConversations();
  const isNewAccount =
    cloudReady && conversations.data?.pages[0]?.items.length === 0;

  React.useEffect(() => {
    if (isNewAccount) onNewUser();
  }, [isNewAccount, onNewUser]);

  return null;
}
