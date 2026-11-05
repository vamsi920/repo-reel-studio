import React from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  getArchivedConversation,
  isLocalOrigin,
  loadArchivedEvents,
  type ArchivedEvent,
} from "#/lib/data-platform/conversation-archive";

/** Lines of the transcript handed to a continued conversation. */
const CONTINUE_CONTEXT_LINES = 40;
const CONTINUE_PREFIX =
  "Continue the conversation below, which ran in my other Neo environment. Pick up where it stopped.";

interface TranscriptLine {
  id: string;
  who: "user" | "agent" | "tool";
  text: string;
}

function messageText(payload: Record<string, unknown>): string {
  const message = payload.llm_message as
    | { content?: Array<{ type?: string; text?: string }> }
    | undefined;
  return (message?.content ?? [])
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join("")
    .trim();
}

function actionText(payload: Record<string, unknown>): string {
  const action = (payload.action ?? {}) as Record<string, unknown>;
  const detail =
    action.command ?? action.path ?? action.url ?? action.message ?? "";
  const tool = (payload.tool_name as string) ?? (action.kind as string) ?? "";
  return `${tool} ${typeof detail === "string" ? detail : ""}`.trim();
}

export function toTranscript(events: ArchivedEvent[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const { event_id: id, payload } of events) {
    const kind = payload.kind as string | undefined;
    if (kind === "MessageEvent") {
      const text = messageText(payload);
      if (text)
        lines.push({
          id,
          who: payload.source === "user" ? "user" : "agent",
          text,
        });
    } else if (kind === "ActionEvent") {
      const text = actionText(payload);
      if (text) lines.push({ id, who: "tool", text });
    }
  }
  return lines;
}

export default function ArchivedConversation() {
  const { conversationId = "" } = useParams();
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { mutate: createConversation } = useCreateConversation();
  const isCreating = useIsCreatingConversation();

  const { data: meta } = useQuery({
    queryKey: ["archived-conversation", conversationId],
    queryFn: () => getArchivedConversation(conversationId),
    enabled: Boolean(conversationId),
  });
  const { data: events, isLoading } = useQuery({
    queryKey: ["archived-conversation-events", conversationId],
    queryFn: () => loadArchivedEvents(conversationId),
    enabled: Boolean(conversationId),
  });
  const lines = React.useMemo(() => toTranscript(events ?? []), [events]);

  const handleContinue = () => {
    const context = lines
      .slice(-CONTINUE_CONTEXT_LINES)
      .map((line) => `${line.who}: ${line.text}`)
      .join("\n");
    createConversation(
      {
        query: `${CONTINUE_PREFIX}\n\n${context}`,
        ...(meta?.selected_repository
          ? {
              repository: {
                name: meta.selected_repository,
                gitProvider: "github",
                ...(meta.selected_branch
                  ? { branch: meta.selected_branch }
                  : {}),
              },
            }
          : {}),
      },
      {
        onSuccess: (data) => navigate(`/conversations/${data.conversation_id}`),
      },
    );
  };

  return (
    <div
      data-testid="archived-conversation"
      className="flex h-full w-full flex-col overflow-hidden"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--oh-border)] px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-[var(--oh-foreground)]">
            {meta?.title ?? conversationId}
          </h1>
          <p className="text-xs text-[var(--oh-muted)]">
            {meta &&
              (isLocalOrigin(meta.origin)
                ? t(I18nKey.ARCHIVE$RAN_LOCALLY)
                : t(I18nKey.ARCHIVE$RAN_IN_CLOUD))}
            {meta?.selected_repository ? ` · ${meta.selected_repository}` : ""}
          </p>
        </div>
        <BrandButton
          testId="archived-conversation-continue"
          type="button"
          variant="primary"
          onClick={handleContinue}
          isDisabled={isCreating || lines.length === 0}
        >
          {t(I18nKey.ARCHIVE$CONTINUE_HERE)}
        </BrandButton>
      </header>
      <p className="px-6 pt-3 text-xs text-[var(--oh-muted)]">
        {t(I18nKey.ARCHIVE$READ_ONLY_NOTE)}
      </p>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && (
          <p className="text-sm text-[var(--oh-muted)]">
            {t(I18nKey.ARCHIVE$LOADING)}
          </p>
        )}
        {!isLoading && lines.length === 0 && (
          <p className="text-sm text-[var(--oh-muted)]">
            {t(I18nKey.ARCHIVE$NO_EVENTS)}
          </p>
        )}
        <ol className="flex flex-col gap-3">
          {lines.map((line) => (
            <li
              key={line.id}
              data-testid={`archived-line-${line.who}`}
              className={
                line.who === "tool"
                  ? "truncate font-mono text-xs text-[var(--oh-muted)]"
                  : "whitespace-pre-wrap rounded-lg border border-[var(--oh-border)] px-3 py-2 text-sm text-[var(--oh-foreground)]"
              }
            >
              {line.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
