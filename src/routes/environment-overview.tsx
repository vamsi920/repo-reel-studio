import React from "react";
import { useTranslation } from "react-i18next";
import { CAPABILITIES } from "#/lib/environment/types/capability";
import type { Capability } from "#/lib/environment/types/capability";
import { I18nKey } from "#/i18n/declaration";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { useEnvironmentReadiness } from "#/hooks/query/use-environment-readiness";
import { useConnections } from "#/hooks/query/use-connections";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import { DEFAULT_PROVIDER_BY_CAPABILITY } from "#/lib/environment/registry";
import type { ReadinessItem } from "#/lib/environment/types/requirements";
import { ReadinessRing } from "#/components/features/environment/overview/readiness-ring";
import { CapabilityTile } from "#/components/features/environment/overview/capability-tile";
import { BlockingIssuesPanel } from "#/components/features/environment/overview/blocking-issues-panel";
import { DeploymentModeCard } from "#/components/features/environment/overview/deployment-mode-card";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";
import { useRequirementLabel } from "#/components/features/environment/shared/requirement-label";

function EnvironmentOverviewScreen() {
  const { t } = useTranslation("openhands");
  const { data: profile } = useEnvironmentProfile();
  const { data: connections } = useConnections();
  const readiness = useEnvironmentReadiness(profile ?? null);
  const openCopilot = useOnboardingCopilotStore((state) => state.openWithSeed);
  const labelFor = useRequirementLabel();

  const providerByCapability = React.useMemo(() => {
    const map = new Map<Capability, string>();
    // A saved profile choice wins; otherwise fall back to whatever this
    // capability has always used, so a fresh install shows its real state
    // rather than a grid of blanks.
    for (const capability of CAPABILITIES) {
      const chosen = profile?.providers[capability]?.providerId;
      const connected = connections?.find(
        (connection) => connection.capability === capability,
      )?.providerId;
      const fallback = DEFAULT_PROVIDER_BY_CAPABILITY[capability];
      const resolved = chosen ?? connected ?? fallback;
      if (resolved) map.set(capability, resolved);
    }
    return map;
  }, [profile, connections]);

  const handleFix = React.useCallback(
    (item: ReadinessItem) => {
      openCopilot(
        `${t(I18nKey.ENVIRONMENT$COPILOT_SEED_FIX)}: ${t(item.featureNameKey)} — ${labelFor(item.node)}`,
      );
    },
    [openCopilot, t, labelFor],
  );

  if (!isSupabaseConfigured) {
    return (
      <div
        data-testid="environment-overview-unconfigured"
        className="ame-alert ame-alert-info"
      >
        {t(I18nKey.ENVIRONMENT$SUPABASE_REQUIRED)}
      </div>
    );
  }

  return (
    <div
      data-testid="environment-overview"
      className="flex flex-col gap-5 pb-6"
    >
      <section className="instrument-panel ame-card flex flex-col gap-6 p-5 lg:flex-row lg:items-center lg:justify-between">
        <ReadinessRing
          score={readiness.score}
          blockingCount={readiness.blocking.length}
        />
        <DeploymentModeCard profile={profile ?? null} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <BlockingIssuesPanel
          testId="environment-blocking"
          titleKey={I18nKey.ENVIRONMENT$BLOCKING_TITLE}
          emptyKey={I18nKey.ENVIRONMENT$BLOCKING_EMPTY}
          items={readiness.blocking}
          tone="blocking"
          onFixWithAgent={handleFix}
        />
        <BlockingIssuesPanel
          testId="environment-degrading"
          titleKey={I18nKey.ENVIRONMENT$DEGRADING_TITLE}
          emptyKey={I18nKey.ENVIRONMENT$DEGRADING_EMPTY}
          items={readiness.degrading}
          tone="degrading"
          onFixWithAgent={handleFix}
        />
        <BlockingIssuesPanel
          testId="environment-unknown"
          titleKey={I18nKey.ENVIRONMENT$UNKNOWN_TITLE}
          emptyKey={I18nKey.ENVIRONMENT$UNKNOWN_HELP}
          items={readiness.unknown}
          tone="unknown"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(I18nKey.ENVIRONMENT$CAPABILITIES_TITLE)}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {t(I18nKey.ENVIRONMENT$CAPABILITIES_SUBTITLE)}
          </p>
        </div>
        <div
          data-testid="capability-grid"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {CAPABILITIES.map((capability, index) => (
            <CapabilityTile
              key={capability}
              capability={capability}
              index={index}
              status={readiness.byCapability[capability] ?? "unknown"}
              providerId={providerByCapability.get(capability)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default EnvironmentOverviewScreen;
