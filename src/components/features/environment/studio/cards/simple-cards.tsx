import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { getConnectorManifest } from "#/lib/environment/registry";
import { ConnectorLogo } from "#/components/features/environment/shared/connector-logo";
import { ProbeResultPanel } from "#/components/features/environment/shared/probe-result-panel";
import {
  CAPABILITY_LABEL_KEY,
  MATURITY_LABEL_KEY,
} from "#/lib/environment/display";
import {
  useOnboardingStudioStore,
  type WorkbenchCard,
} from "#/stores/onboarding-studio-store";
import { FEATURE_REQUIREMENTS } from "#/lib/environment/requirements/feature-requirements";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import {
  useEnvironmentProfile,
  useSaveEnvironmentProfile,
} from "#/hooks/query/use-environment-profile";
import type { PostResultFn } from "#/services/onboarding-control";
import type { EnvironmentProfile } from "#/lib/environment/types/profile";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";

/**
 * Provider choice, rendered where the conversation is rather than on a
 * separate page. Choosing does not connect anything -- it tells the agent, and
 * the agent opens the right form next, so the user is never guessing which
 * fields matter.
 */
export function ProviderPickerCard({
  card,
  postResult,
}: {
  card: Extract<WorkbenchCard, { kind: "picker" }>;
  postResult: PostResultFn;
}) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid={`workbench-picker-${card.capability}`}
      className="ame-card flex flex-col gap-3 p-4"
    >
      <span className="ame-eyebrow">
        {`${t(I18nKey.ENVIRONMENT$STUDIO_PICKER_TITLE)} · ${t(CAPABILITY_LABEL_KEY[card.capability])}`}
      </span>
      <div className="flex flex-col gap-2">
        {card.providerIds.map((providerId) => {
          const manifest = getConnectorManifest(providerId);
          if (!manifest) return null;
          return (
            <button
              key={providerId}
              type="button"
              data-testid={`workbench-pick-${providerId}`}
              onClick={() =>
                postResult(
                  `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
                    status: "provider_chosen",
                    capability: card.capability,
                    provider: providerId,
                  })}`,
                )
              }
              className="ame-card-interactive flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-color)] p-2.5 text-left"
            >
              <ConnectorLogo logo={manifest.logo} size={26} />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm text-[var(--text-primary)]">
                  {t(manifest.nameKey)}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {t(manifest.descriptionKey)}
                </span>
              </span>
              {manifest.maturity !== "ga" ? (
                <span className="ame-badge ame-badge-neutral ml-auto shrink-0">
                  {t(MATURITY_LABEL_KEY[manifest.maturity])}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProbeCard({
  card,
}: {
  card: Extract<WorkbenchCard, { kind: "probe" }>;
}) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-testid="workbench-probe-card"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow">
        {`${t(I18nKey.ENVIRONMENT$STUDIO_PROBE_TITLE)} · ${card.label}`}
      </span>
      <ProbeResultPanel result={card.result} />
    </div>
  );
}

/**
 * Merges an agent-proposed patch onto the org's current profile.
 *
 * The agent sends an intentionally partial diff (e.g. `{ mode: "hybrid" }`),
 * not a full profile -- see `propose_profile_change` in
 * `src/services/onboarding-control.ts`. `EnvironmentProfileRepository.put()`
 * does a full upsert with no merge of its own, so saving the patch verbatim
 * would discard every field the patch didn't mention (providers, network,
 * policy, ...). Nested known sections are merged one level deep so a
 * single-field patch inside e.g. `network` doesn't wipe its siblings either.
 *
 * Two spots need a second level of merging, because a patch that touches
 * them is still meant to be partial: `network.mirrors` (host -> mirror) and
 * each `providers[capability]` selection (including its own nested
 * `config`). Without this, a patch adding one new mirror wiped every other
 * configured mirror, and a patch tweaking one `config` key on a provider
 * dropped that provider's `providerId`/`instanceKey`, corrupting the stored
 * selection.
 */
function mergeProfilePatch(
  profile: EnvironmentProfile,
  patch: Record<string, unknown>,
): EnvironmentProfile {
  const p = patch as Partial<EnvironmentProfile>;

  const providers = { ...profile.providers };
  if (p.providers) {
    for (const key of Object.keys(
      p.providers,
    ) as (keyof typeof p.providers)[]) {
      const incoming = p.providers[key];
      if (!incoming) continue;
      const existing = providers[key];
      providers[key] = {
        ...existing,
        ...incoming,
        config: { ...existing?.config, ...incoming.config },
      };
    }
  }

  return {
    ...profile,
    ...p,
    orgId: profile.orgId,
    providers,
    network: {
      ...profile.network,
      ...(p.network ?? {}),
      mirrors: { ...profile.network.mirrors, ...(p.network?.mirrors ?? {}) },
      inbound: { ...profile.network.inbound, ...(p.network?.inbound ?? {}) },
    },
    policy: { ...profile.policy, ...(p.policy ?? {}) },
    runtime: { ...profile.runtime, ...(p.runtime ?? {}) },
    meta: { ...profile.meta, ...(p.meta ?? {}) },
  };
}

/**
 * A configuration change the agent worked out.
 *
 * Never auto-applied. The agent proposes; a human decides. Applying it
 * requires org admin, which the save mutation enforces server-side.
 */
export function ProposalCard({
  card,
  postResult,
}: {
  card: Extract<WorkbenchCard, { kind: "proposal" }>;
  postResult: PostResultFn;
}) {
  const { t } = useTranslation("openhands");
  const updateCard = useOnboardingStudioStore((state) => state.updateCard);
  const { data: profile } = useEnvironmentProfile();
  const { mutate: saveProfile, isPending } = useSaveEnvironmentProfile();

  const decide = (accepted: boolean) => {
    if (!accepted) {
      updateCard(card.id, { status: "discarded" });
      postResult(
        `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
          status: "proposal_discarded",
          patch_keys: Object.keys(card.patch),
        })}`,
      );
      return;
    }
    if (!profile) return;
    saveProfile(mergeProfilePatch(profile, card.patch), {
      onSuccess: () => {
        updateCard(card.id, { status: "applied" });
        postResult(
          `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
            status: "proposal_applied",
            patch_keys: Object.keys(card.patch),
          })}`,
        );
      },
      onError: (error) =>
        postResult(
          `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({
            status: "proposal_failed",
            reason: (error as Error)?.message ?? "save_failed",
          })}`,
        ),
    });
  };

  return (
    <div
      data-testid="workbench-proposal-card"
      data-status={card.status}
      className="ame-card flex flex-col gap-3 p-4"
    >
      <span className="ame-eyebrow">
        {t(I18nKey.ENVIRONMENT$STUDIO_PROPOSAL_TITLE)}
      </span>
      {card.rationale ? (
        <p className="text-sm text-[var(--text-secondary)]">{card.rationale}</p>
      ) : null}
      <pre className="max-h-48 overflow-auto rounded-[var(--radius-sm)] bg-[var(--background-secondary)] p-2 text-xs text-[var(--text-primary)]">
        {JSON.stringify(card.patch, null, 2)}
      </pre>
      {card.status === "pending" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="workbench-proposal-apply"
            disabled={isPending || !profile}
            onClick={() => decide(true)}
            className="ame-btn-primary ame-btn-sm"
          >
            {t(I18nKey.ENVIRONMENT$PROPOSAL_APPLY)}
          </button>
          <button
            type="button"
            data-testid="workbench-proposal-discard"
            disabled={isPending}
            onClick={() => decide(false)}
            className="ame-btn-ghost ame-btn-sm"
          >
            {t(I18nKey.ENVIRONMENT$PROPOSAL_DISCARD)}
          </button>
        </div>
      ) : (
        <span
          className={cn(
            "ame-badge self-start",
            card.status === "applied"
              ? "ame-badge-success"
              : "ame-badge-neutral",
          )}
        >
          {t(
            card.status === "applied"
              ? I18nKey.ENVIRONMENT$PROPOSAL_APPLIED
              : I18nKey.ENVIRONMENT$PROPOSAL_DISCARDED,
          )}
        </span>
      )}
    </div>
  );
}

export function ChecklistCard({
  card,
}: {
  card: Extract<WorkbenchCard, { kind: "checklist" }>;
}) {
  const { t } = useTranslation("openhands");
  const features = React.useMemo(
    () =>
      FEATURE_REQUIREMENTS.filter(
        (feature) =>
          card.featureIds.length === 0 ||
          card.featureIds.includes(feature.featureId),
      ),
    [card.featureIds],
  );

  return (
    <div
      data-testid="workbench-checklist-card"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow">
        {t(I18nKey.ENVIRONMENT$STUDIO_CHECKLIST_TITLE)}
      </span>
      <ul className="flex flex-col gap-1">
        {features.map((feature) => (
          <li
            key={feature.featureId}
            className="text-sm text-[var(--text-primary)]"
          >
            {t(feature.nameKey)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HandoffCard({
  card,
}: {
  card: Extract<WorkbenchCard, { kind: "handoff" }>;
}) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-testid="workbench-handoff-card"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow">
        {t(I18nKey.ENVIRONMENT$STUDIO_HANDOFF_TITLE)}
      </span>
      <pre className="max-h-72 overflow-auto rounded-[var(--radius-sm)] bg-[var(--background-secondary)] p-2 text-xs text-[var(--text-primary)]">
        {card.markdown}
      </pre>
    </div>
  );
}

/**
 * The closing card. Renders the live readiness report next to the agent's
 * claim of completion, so "we're done" is checkable rather than asserted.
 */
export function SummaryCard({
  readinessScore,
  blockingCount,
}: {
  readinessScore: number;
  blockingCount: number;
}) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  React.useEffect(() => {
    // The summary is the moment someone reads the board, so make sure it is
    // not showing a cached picture from before the last connection. The
    // readiness score's two heaviest inputs -- GitHub and Jira connection
    // status -- live under ["github-connection"]/["jira-connection"], outside
    // the ["environment"] prefix, so this needs the same full invalidation
    // every other connection-changing action already uses.
    void invalidateConnectionCaches(queryClient);
  }, [queryClient]);

  return (
    <div
      data-testid="workbench-summary-card"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow">
        {t(I18nKey.ENVIRONMENT$STUDIO_SUMMARY_TITLE)}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-[var(--text-primary)]">
          {readinessScore}
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          {blockingCount > 0
            ? t(I18nKey.ENVIRONMENT$READINESS_BLOCKED)
            : t(I18nKey.ENVIRONMENT$READINESS_READY)}
        </span>
      </div>
    </div>
  );
}
