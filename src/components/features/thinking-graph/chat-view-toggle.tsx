import React from "react";
import { useTranslation } from "react-i18next";
import { MessagesSquare, Waypoints } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export type ChatViewMode = "graph" | "transcript";

export const THINKING_GRAPH_VIEW_KEY = "neodevex-chat-view-mode";
const DEFAULT_CHAT_VIEW_MODE: ChatViewMode = "graph";

function readStoredMode(): ChatViewMode {
  try {
    const stored = window.localStorage.getItem(THINKING_GRAPH_VIEW_KEY);
    return stored === "graph" || stored === "transcript"
      ? stored
      : DEFAULT_CHAT_VIEW_MODE;
  } catch {
    return DEFAULT_CHAT_VIEW_MODE;
  }
}

/** Graph vs. transcript choice for the chat page, remembered per browser. */
export function useChatViewMode(): [
  ChatViewMode,
  (mode: ChatViewMode) => void,
] {
  const [mode, setMode] = React.useState<ChatViewMode>(readStoredMode);
  const update = React.useCallback((next: ChatViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(THINKING_GRAPH_VIEW_KEY, next);
    } catch {
      // Storage unavailable (private mode) — the choice just won't persist.
    }
  }, []);
  return [mode, update];
}

const OPTIONS: {
  mode: ChatViewMode;
  labelKey: I18nKey;
  Icon: typeof Waypoints;
}[] = [
  {
    mode: "graph",
    labelKey: I18nKey.THINKING_GRAPH$VIEW_GRAPH,
    Icon: Waypoints,
  },
  {
    mode: "transcript",
    labelKey: I18nKey.THINKING_GRAPH$VIEW_TRANSCRIPT,
    Icon: MessagesSquare,
  },
];

export function ChatViewToggle({
  value,
  onChange,
}: {
  value: ChatViewMode;
  onChange: (mode: ChatViewMode) => void;
}) {
  const { t } = useTranslation("openhands");
  return (
    <div
      role="radiogroup"
      aria-label={t(I18nKey.THINKING_GRAPH$VIEW_TOGGLE_LABEL)}
      className="flex items-center gap-0.5 rounded-full border border-[var(--oh-border-subtle)] bg-[var(--oh-surface)] p-0.5"
    >
      {OPTIONS.map(({ mode, labelKey, Icon }) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-testid={`chat-view-${mode}`}
            onClick={() => onChange(mode)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
              isActive
                ? "bg-[#3b6cf6] text-[#ffffff] shadow-sm"
                : "text-[var(--oh-muted)] hover:text-[var(--oh-foreground)]",
            )}
          >
            <Icon size={13} />
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
