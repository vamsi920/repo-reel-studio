import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAgentStore } from "#/stores/agent-store";
import { AgentState } from "#/types/agent-state";
import type { MigrationPhase } from "#/constants/modernization-control";

/**
 * "Neo ME is thinking" motion. Everything here keys off one boolean -- the
 * agent is running right now -- and renders static, non-animated markup
 * otherwise, so an idle or finished studio stays calm. The keyframes live in
 * src/styles/neo-design-system.css (`.neome-*`) and stop under
 * prefers-reduced-motion.
 */

/** True while the agent is working (a model call or a tool is in flight). */
export function useNeoMeThinking(): boolean {
  const state = useAgentStore((s) => s.curAgentState);
  return state === AgentState.RUNNING;
}

/** Phrases cycled while thinking, chosen by the phase of the active step. */
export const THINKING_PHRASES: Record<MigrationPhase | "idle", I18nKey[]> = {
  idle: [
    I18nKey.NEOME$THINK_READING,
    I18nKey.NEOME$THINK_MAPPING,
    I18nKey.NEOME$THINK_REVERSE,
  ],
  understand: [
    I18nKey.NEOME$THINK_READING,
    I18nKey.NEOME$THINK_MAPPING,
    I18nKey.NEOME$THINK_REVERSE,
  ],
  interview: [I18nKey.NEOME$THINK_OPTIONS, I18nKey.NEOME$THINK_MAPPING],
  specify: [I18nKey.NEOME$THINK_SPEC, I18nKey.NEOME$THINK_FLOWS],
  characterize: [I18nKey.NEOME$THINK_PINNING, I18nKey.NEOME$THINK_CONTRACTS],
  scaffold: [I18nKey.NEOME$THINK_SCAFFOLD, I18nKey.NEOME$THINK_TESTS],
  migrate: [
    I18nKey.NEOME$THINK_PORTING,
    I18nKey.NEOME$THINK_TESTS,
    I18nKey.NEOME$THINK_CONTRACTS,
  ],
  data: [I18nKey.NEOME$THINK_DATA, I18nKey.NEOME$THINK_TESTS],
  verify: [I18nKey.NEOME$THINK_PARITY, I18nKey.NEOME$THINK_TESTS],
  report: [I18nKey.NEOME$THINK_REPORT],
};

const PHRASE_INTERVAL_MS = 2600;

/** The Neo arch mark with a soft glow and an orbiting dot. */
export function NeoOrb({ size = 22 }: { size?: number }) {
  return (
    <span
      className="neome-orb"
      style={{ width: size, height: size }}
      aria-hidden
      data-testid="neome-orb"
    >
      <span className="neome-orb__glow" />
      <span className="neome-orb__track" />
      <svg
        viewBox="0 0 1024 1024"
        width={size * 0.72}
        height={size * 0.72}
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M394 152H630C822.278 152 978 307.722 978 500V872C978 905.137 951.137 932 918 932C884.863 932 858 905.137 858 872V500C858 373.452 755.548 271 630 271H394C267.452 271 165 373.452 165 500V872C165 905.137 138.137 932 105 932C71.8629 932 45 905.137 45 872V500C45 307.722 200.722 152 394 152Z"
        />
      </svg>
    </span>
  );
}

/**
 * The shimmering, rotating "what I'm doing" phrase with bouncing dots.
 * Rotation pauses (and the first phrase stays) under reduced motion.
 */
export function ThinkingPhrase({ phase }: { phase: MigrationPhase | null }) {
  const { t } = useTranslation("openhands");
  const phrases = THINKING_PHRASES[phase ?? "idle"];
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
      data-testid="neome-thinking-phrase"
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
