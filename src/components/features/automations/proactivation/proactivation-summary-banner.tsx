import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  getWatchAreaLabel,
  type ProactivationConfig,
} from "#/utils/proactivation-prompt";

const AUTONOMY_LABEL_KEYS: Record<string, I18nKey> = {
  recommend: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_RECOMMEND_LABEL,
  "prepare-fix": I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_PREPARE_FIX_LABEL,
  "create-pr": I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_CREATE_PR_LABEL,
};

interface ProactivationSummaryBannerProps {
  config: ProactivationConfig;
}

export function ProactivationSummaryBanner({
  config,
}: ProactivationSummaryBannerProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-content">
        <Sparkles className="size-4 text-[var(--oh-primary,theme(colors.blue.400))]" />
        {t(I18nKey.AUTOMATIONS$PROACTIVATION_TITLE)}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_SUMMARY_WATCHING)}:{" "}
          {config.watchAreas.map((area) => getWatchAreaLabel(area)).join(", ")}
        </span>
        <span>
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_SUMMARY_MODE)}:{" "}
          {t(AUTONOMY_LABEL_KEYS[config.autonomyLevel])}
        </span>
      </div>
    </div>
  );
}
