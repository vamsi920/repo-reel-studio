import { useTranslation } from "react-i18next";
import { Globe, Server, ShieldOff, Layers } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type {
  DeploymentMode,
  EnvironmentProfile,
} from "#/lib/environment/types/profile";
import {
  DEPLOYMENT_MODE_DESC_KEY,
  DEPLOYMENT_MODE_LABEL_KEY,
} from "#/lib/environment/display";

const MODE_ICON: Record<DeploymentMode, typeof Globe> = {
  saas: Globe,
  hybrid: Layers,
  "self-hosted": Server,
  "air-gapped": ShieldOff,
};

export interface DeploymentModeCardProps {
  profile: EnvironmentProfile | null;
}

export function DeploymentModeCard({ profile }: DeploymentModeCardProps) {
  const { t } = useTranslation("openhands");
  const mode = profile?.mode ?? "saas";
  const Icon = MODE_ICON[mode];

  return (
    <div
      data-testid="deployment-mode-card"
      data-mode={mode}
      className="flex min-w-[240px] flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background-secondary)] p-4"
    >
      <span className="ame-eyebrow">
        {t(I18nKey.ENVIRONMENT$DEPLOYMENT_MODE)}
      </span>
      <div className="flex items-center gap-2">
        <Icon size={16} aria-hidden className="text-[var(--primary-500)]" />
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {t(DEPLOYMENT_MODE_LABEL_KEY[mode])}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        {t(DEPLOYMENT_MODE_DESC_KEY[mode])}
      </p>
      {profile?.policy.dataResidency ? (
        <span className="ame-badge ame-badge-neutral self-start uppercase">
          {profile.policy.dataResidency}
        </span>
      ) : null}
    </div>
  );
}
