import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  isLocalOrigin,
  listOtherOriginConversations,
} from "#/lib/data-platform/conversation-archive";

/**
 * Chats the user ran in their other environment (their laptop when this is
 * production, production when this is their laptop). They open as the saved
 * transcript with "Continue here".
 */
export function OtherEnvironmentConversations({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const { data } = useQuery({
    queryKey: ["other-environment-conversations", backend.id, backend.host],
    queryFn: () => listOtherOriginConversations(30),
    refetchInterval: 30_000,
  });
  if (!data?.length) return null;
  return (
    <section
      data-testid="other-environment-conversations"
      className="mt-2 border-t border-[var(--oh-border)] pt-2"
    >
      <h3 className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--oh-muted)]">
        {t(I18nKey.ARCHIVE$OTHER_ENVIRONMENT)}
      </h3>
      <ul>
        {data.map((conversation) => (
          <li key={conversation.conversation_id}>
            <NavigationLink
              to={`/conversations/archived/${conversation.conversation_id}`}
              onClick={onNavigate}
              className="block truncate rounded-md px-3 py-1.5 text-sm text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
            >
              {conversation.title ?? conversation.conversation_id}
              <span className="ml-2 text-[11px] text-[var(--oh-muted)]">
                {isLocalOrigin(conversation.origin)
                  ? t(I18nKey.ARCHIVE$RAN_LOCALLY)
                  : t(I18nKey.ARCHIVE$RAN_IN_CLOUD)}
              </span>
            </NavigationLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
