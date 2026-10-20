import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import InfoCircleIcon from "#/icons/info-circle.svg?react";
import {
  ROUTE_REASON_LABEL,
  ROUTING_TIER_LABEL,
} from "#/lib/model-routing/labels";
import type { RoutingDecision } from "#/lib/model-routing/types";
import { formatModelNameForDisplay } from "#/utils/format-model-name";
import { GenericEventMessage } from "./generic-event-message";

interface ModelRoutingChipProps {
  decision: RoutingDecision;
}

/**
 * Inline "Auto switched to X" note. Expanding it shows why: every reason the
 * router recorded, the tier, and the complexity score — the explainability
 * half of Auto mode.
 */
// @spec MR-016 — Routing visibility in chat
export function ModelRoutingChip({ decision }: ModelRoutingChipProps) {
  const { t } = useTranslation("openhands");
  const name = decision.profileName ?? "";
  const title =
    decision.source === "fallback"
      ? t(I18nKey.MODEL_ROUTING$CHIP_FALLBACK, { name })
      : t(I18nKey.MODEL_ROUTING$CHIP, { name });
  const model = formatModelNameForDisplay(decision.model);

  return (
    <GenericEventMessage
      title={
        <span
          className="inline-flex items-center gap-1.5"
          data-testid="model-routing-chip"
        >
          <InfoCircleIcon
            width={14}
            height={14}
            className="shrink-0 text-neutral-400"
            aria-hidden
          />
          <span>{title}</span>
        </span>
      }
      details={
        <ul className="flex flex-col gap-1 px-2 py-1 text-sm text-neutral-300">
          {decision.reasons.map((reason) => (
            <li key={reason}>{t(ROUTE_REASON_LABEL[reason])}</li>
          ))}
          <li className="text-xs text-neutral-400">
            {[
              model,
              decision.tier ? t(ROUTING_TIER_LABEL[decision.tier]) : null,
              decision.score !== null
                ? t(I18nKey.MODEL_ROUTING$SCORE, {
                    score: decision.score.toFixed(2),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </li>
        </ul>
      }
    />
  );
}
