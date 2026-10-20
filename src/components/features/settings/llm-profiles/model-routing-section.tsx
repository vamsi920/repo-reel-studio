import React from "react";
import { useTranslation } from "react-i18next";
import type { ProfileInfo } from "@openhands/typescript-client";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useTracking } from "#/hooks/use-tracking";
import { I18nKey } from "#/i18n/declaration";
import { effectiveState } from "#/lib/model-routing/health";
import {
  ROUTE_REASON_LABEL,
  ROUTING_POLICY_LABEL,
  primaryReason,
} from "#/lib/model-routing/labels";
import { resolveRoutingPreferences } from "#/lib/model-routing/prefs";
import { ROUTING_POLICIES } from "#/lib/model-routing/types";
import { useModelRoutingStore } from "#/stores/model-routing-store";
import { cn } from "#/utils/utils";
import { formatModelNameForDisplay } from "#/utils/format-model-name";

const RECENT_DECISIONS_SHOWN = 8;

interface ModelRoutingSectionProps {
  profiles: ProfileInfo[];
  canManage: boolean;
}

function HealthBadge({ profileName }: { profileName: string }) {
  const { t } = useTranslation("openhands");
  const health = useModelRoutingStore((s) => s.health[profileName]);
  const resetHealth = useModelRoutingStore((s) => s.resetHealth);
  const [now, setNow] = React.useState(() => Date.now());
  const isCooling = health?.state === "open" && !health.misconfigured;
  // Tick only while a cooldown countdown is on screen.
  React.useEffect(() => {
    if (!isCooling) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCooling]);
  const state = effectiveState(health, now);

  let label = t(I18nKey.MODEL_ROUTING$HEALTH_HEALTHY);
  let tone = "text-emerald-400";
  if (health?.misconfigured) {
    label = t(I18nKey.MODEL_ROUTING$HEALTH_MISCONFIGURED);
    tone = "text-red-400";
  } else if (state === "open") {
    const seconds = Math.max(
      1,
      Math.ceil(((health?.openedUntil ?? now) - now) / 1000),
    );
    label = t(I18nKey.MODEL_ROUTING$HEALTH_COOLING, { seconds });
    tone = "text-amber-400";
  } else if (state === "half_open") {
    label = t(I18nKey.MODEL_ROUTING$HEALTH_RECOVERING);
    tone = "text-amber-300";
  }

  const isHealthy = !health?.misconfigured && state === "closed";
  return (
    <span className="flex items-center gap-2 text-xs">
      <span
        className={tone}
        data-testid={`model-routing-health-${profileName}`}
      >
        {label}
      </span>
      {!isHealthy && (
        <button
          type="button"
          className="underline text-[var(--oh-muted)] hover:text-white"
          onClick={() => resetHealth(profileName)}
        >
          {t(I18nKey.SETTINGS$MODEL_ROUTING_RESET_HEALTH)}
        </button>
      )}
    </span>
  );
}

/**
 * Settings for model routing ("Auto"): the global default, the policy that
 * trades quality against cost, an optional per-conversation budget, which
 * profiles Auto may pick, their live health, and the recent decision log.
 * Every control saves immediately through `misc_settings.app_preferences`.
 */
// @spec MR-018 — Model routing settings
export function ModelRoutingSection({
  profiles,
  canManage,
}: ModelRoutingSectionProps) {
  const { t } = useTranslation("openhands");
  const { data: settings } = useSettings();
  const { mutate: saveSettings } = useSaveSettings();
  const { trackRoutingModeChanged } = useTracking();
  const prefs = resolveRoutingPreferences(settings);
  const decisions = useModelRoutingStore((s) => s.decisions);
  const recent = decisions
    .filter((d) => d.task === "chat_turn" || d.task === "conversation_start")
    .slice(0, RECENT_DECISIONS_SHOWN);
  const [budgetDraft, setBudgetDraft] = React.useState(
    prefs.budgetUsd ? String(prefs.budgetUsd) : "",
  );

  React.useEffect(() => {
    setBudgetDraft(prefs.budgetUsd ? String(prefs.budgetUsd) : "");
  }, [prefs.budgetUsd]);

  const commitBudget = () => {
    const parsed = Number.parseFloat(budgetDraft);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    if (next === prefs.budgetUsd) return;
    saveSettings({ model_routing_budget_usd: next });
  };

  const toggleProfile = (name: string, included: boolean) => {
    const excluded = new Set(prefs.excludedProfiles);
    if (included) excluded.delete(name);
    else excluded.add(name);
    saveSettings({ model_routing_excluded_profiles: [...excluded] });
  };

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="model-routing-section"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-white">
          {t(I18nKey.SETTINGS$MODEL_ROUTING_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.SETTINGS$MODEL_ROUTING_DESCRIPTION)}
        </p>
        {profiles.length < 2 && (
          <p className="text-xs text-[var(--oh-text-dim)]">
            {t(I18nKey.SETTINGS$MODEL_ROUTING_SINGLE_PROFILE)}
          </p>
        )}
      </div>

      <SettingsSwitch
        testId="model-routing-default-auto"
        isToggled={prefs.mode === "auto"}
        isDisabled={!canManage}
        onToggle={(on) => {
          const mode = on ? "auto" : "manual";
          saveSettings({ model_routing_mode: mode });
          trackRoutingModeChanged({ scope: "global", mode });
        }}
      >
        {t(I18nKey.SETTINGS$MODEL_ROUTING_DEFAULT_AUTO)}
      </SettingsSwitch>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-white">
          {t(I18nKey.SETTINGS$MODEL_ROUTING_POLICY)}
        </span>
        <div
          role="radiogroup"
          aria-label={t(I18nKey.SETTINGS$MODEL_ROUTING_POLICY)}
          className="flex flex-wrap gap-2"
        >
          {ROUTING_POLICIES.map((policy) => (
            <BrandButton
              key={policy}
              testId={`model-routing-policy-${policy}`}
              type="button"
              variant={prefs.policy === policy ? "primary" : "secondary"}
              isDisabled={!canManage}
              onClick={() => {
                if (policy !== prefs.policy)
                  saveSettings({ model_routing_policy: policy });
              }}
            >
              <span role="radio" aria-checked={prefs.policy === policy}>
                {t(ROUTING_POLICY_LABEL[policy])}
              </span>
            </BrandButton>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 max-w-[320px]">
        <SettingsInput
          testId="model-routing-budget"
          label={t(I18nKey.SETTINGS$MODEL_ROUTING_BUDGET)}
          type="number"
          min={0}
          step={0.5}
          value={budgetDraft}
          isDisabled={!canManage}
          onChange={setBudgetDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitBudget();
          }}
        />
        <p className="text-xs text-[var(--oh-text-dim)]">
          {t(I18nKey.SETTINGS$MODEL_ROUTING_BUDGET_HELP)}
        </p>
        {budgetDraft !== (prefs.budgetUsd ? String(prefs.budgetUsd) : "") && (
          <BrandButton
            testId="model-routing-budget-save"
            type="button"
            variant="secondary"
            onClick={commitBudget}
          >
            {t(I18nKey.BUTTON$SAVE)}
          </BrandButton>
        )}
      </div>

      {profiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-white">
            {t(I18nKey.SETTINGS$MODEL_ROUTING_PROFILES)}
          </span>
          <ul className="flex flex-col gap-2">
            {profiles.map((profile) => (
              <li
                key={profile.name}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <SettingsSwitch
                  testId={`model-routing-include-${profile.name}`}
                  isToggled={!prefs.excludedProfiles.includes(profile.name)}
                  isDisabled={!canManage}
                  onToggle={(on) => toggleProfile(profile.name, on)}
                >
                  {/* One text node: the profile list above already renders
                      the bare name, and this row adds the model beside it. */}
                  <span className="text-sm">
                    {[profile.name, formatModelNameForDisplay(profile.model)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </SettingsSwitch>
                <HealthBadge profileName={profile.name} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-white">
          {t(I18nKey.SETTINGS$MODEL_ROUTING_RECENT)}
        </span>
        {recent.length === 0 ? (
          <p className="text-xs text-[var(--oh-text-dim)]">
            {t(I18nKey.SETTINGS$MODEL_ROUTING_NO_DECISIONS)}
          </p>
        ) : (
          <ul
            className="flex flex-col gap-1 text-xs"
            data-testid="model-routing-recent"
          >
            {recent.map((decision) => {
              const reason = primaryReason(decision.reasons);
              return (
                <li
                  key={decision.id}
                  className={cn(
                    "flex flex-wrap gap-2 text-[var(--oh-muted)]",
                    decision.switched && "text-white",
                  )}
                >
                  <span>{new Date(decision.at).toLocaleTimeString()}</span>
                  <span>{decision.profileName}</span>
                  {reason && <span>{t(ROUTE_REASON_LABEL[reason])}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
