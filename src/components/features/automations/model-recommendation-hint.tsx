import { useTranslation } from "react-i18next";
import type { ProfileInfo } from "@openhands/typescript-client";
import { I18nKey } from "#/i18n/declaration";
import { recommendModelProfile } from "#/lib/automation/model-recommendation";

interface ModelRecommendationHintProps {
  profiles: readonly ProfileInfo[];
  active: string | null;
  selected: string;
  prompt: string;
  onUse: (profile: string) => void;
  testIdPrefix: string;
}

/**
 * Suggests a stronger saved model profile when the instructions describe
 * review or investigation work and the chosen model is a light one.
 */
export function ModelRecommendationHint({
  profiles,
  active,
  selected,
  prompt,
  onUse,
  testIdPrefix,
}: ModelRecommendationHintProps) {
  const { t } = useTranslation("openhands");
  const recommended = recommendModelProfile({
    profiles,
    active,
    selected,
    prompt,
  });
  if (!recommended) return null;

  return (
    <div
      data-testid={`${testIdPrefix}-model-recommendation`}
      className="-mt-1 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--oh-accent)]/30 bg-[var(--oh-accent)]/5 px-3 py-2 text-xs text-content"
    >
      <span>
        {t(I18nKey.AUTOMATIONS$MODEL_RECOMMENDATION, { profile: recommended })}
      </span>
      <button
        type="button"
        data-testid={`${testIdPrefix}-use-recommended-model`}
        onClick={() => onUse(recommended)}
        className="shrink-0 rounded-md border border-[var(--oh-border)] px-2 py-1 font-medium hover:bg-surface-raised"
      >
        {t(I18nKey.AUTOMATIONS$MODEL_RECOMMENDATION_USE, {
          profile: recommended,
        })}
      </button>
    </div>
  );
}
