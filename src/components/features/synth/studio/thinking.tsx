import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import type { SynthProjectStatus } from "#/constants/synth-control";
import { NeoOrb } from "#/components/features/modernization/studio/thinking";

export { NeoOrb };

/** True while the agent is working (a model call or a tool in flight). */
export function useSynthThinking(): boolean {
  const status = useConversationStateStore((s) => s.execution_status);
  return status === ExecutionStatus.RUNNING;
}

/** Phrases cycled while thinking, chosen by the project's phase. */
export const THINKING_PHRASES: Record<SynthProjectStatus, I18nKey[]> = {
  intake: [I18nKey.SYNTH$THINK_READING, I18nKey.SYNTH$THINK_SCHEMA],
  discovering: [
    I18nKey.SYNTH$THINK_READING,
    I18nKey.SYNTH$THINK_SCHEMA,
    I18nKey.SYNTH$THINK_RELATIONS,
  ],
  modeling: [
    I18nKey.SYNTH$THINK_RULES,
    I18nKey.SYNTH$THINK_RELATIONS,
    I18nKey.SYNTH$THINK_FLOWS,
  ],
  interviewing: [I18nKey.SYNTH$THINK_OPTIONS],
  ready: [I18nKey.SYNTH$THINK_SCENARIOS, I18nKey.SYNTH$THINK_RULES],
  generating: [I18nKey.SYNTH$THINK_GENERATING, I18nKey.SYNTH$THINK_VALIDATING],
  verifying: [I18nKey.SYNTH$THINK_LOADING, I18nKey.SYNTH$THINK_TESTING],
  done: [I18nKey.SYNTH$THINK_REPORT],
  failed: [I18nKey.SYNTH$THINK_READING],
};

const PHRASE_INTERVAL_MS = 2600;

/** The shimmering, rotating "what I'm doing" phrase (reuses Neo ME's motion CSS). */
export function ThinkingPhrase({ status }: { status: SynthProjectStatus }) {
  const { t } = useTranslation("openhands");
  const phrases = THINKING_PHRASES[status];
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || phrases.length < 2) return undefined;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % phrases.length),
      PHRASE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [phrases]);

  return (
    <span
      data-testid="synth-thinking-phrase"
      className="inline-flex items-center text-sm font-medium"
      aria-live="polite"
    >
      <span key={phrases[index]} className="neome-phrase neome-shimmer">
        {t(phrases[index])}
      </span>
      <span className="neome-dots text-[var(--primary-500)]" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}
