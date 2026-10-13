import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";

/**
 * Automation limits and alerts, enforced by scripts/automation-guard.mjs on
 * every GitHub event bridge tick. Both live in the agent-server's
 * frontend-owned `misc_settings` block: the guard is a local sidecar, so
 * these only apply to local backends.
 */
export interface AutomationPolicy {
  /** Rolling 24 h spend cap in USD, including runs still going. */
  daily_budget_usd?: number | null;
  /** Rolling 1 h run cap; runs beyond it are cancelled. */
  max_runs_per_hour?: number | null;
  /** Cancel a new run while an earlier one is still going. */
  skip_overlapping_runs?: boolean;
}

export type AutomationAlertMode = "failures" | "all" | "off";

export interface AutomationAlertSettings {
  on?: AutomationAlertMode;
  desktop?: boolean;
  /** Slack, Discord or any https webhook. */
  webhook_url?: string;
}

export type GuardCancelReason = "budget" | "rate_limit" | "overlap";

export interface GuardNotes {
  paused?: Record<
    string,
    {
      reason: "budget";
      at: string;
      until: string | null;
      spent_usd?: number;
      budget_usd?: number | null;
    } | null
  >;
  cancelled?: Record<
    string,
    { reason: GuardCancelReason; at: string; automation_id: string } | null
  >;
}

export interface AutomationPolicies {
  alerts?: AutomationAlertSettings;
  automations?: Record<string, AutomationPolicy | null>;
}

interface AutomationMiscSettings {
  automation_policies?: AutomationPolicies;
  automation_guard?: GuardNotes;
}

function client() {
  return new SettingsClient(getAgentServerClientOptions());
}

async function patchMisc(diff: AutomationMiscSettings): Promise<void> {
  await client().updateSettings({ misc_settings_diff: diff });
}

/** True when a policy sets at least one limit. */
export function hasLimits(policy: AutomationPolicy | null | undefined) {
  return (
    !!policy &&
    (policy.daily_budget_usd != null ||
      policy.max_runs_per_hour != null ||
      !!policy.skip_overlapping_runs)
  );
}

class AutomationPolicyService {
  static async get(): Promise<{
    policies: AutomationPolicies;
    guard: GuardNotes;
  }> {
    const settings = (await client().getSettings()) as {
      misc_settings?: AutomationMiscSettings;
    };
    return {
      policies: settings.misc_settings?.automation_policies ?? {},
      guard: settings.misc_settings?.automation_guard ?? {},
    };
  }

  /** Save one automation's limits; no limits removes its policy. */
  static async savePolicy(
    automationId: string,
    policy: AutomationPolicy,
  ): Promise<void> {
    await patchMisc({
      automation_policies: {
        // The settings diff is deep-merged and null deletes a key, so a
        // policy is replaced by clearing it first.
        automations: { [automationId]: hasLimits(policy) ? policy : null },
      },
    });
  }

  static async saveAlerts(alerts: AutomationAlertSettings): Promise<void> {
    await patchMisc({ automation_policies: { alerts } });
  }

  /**
   * Forget that the guard paused this automation, so a manual on/off is not
   * undone by the guard's automatic resume.
   */
  static async clearPause(automationId: string): Promise<void> {
    await patchMisc({ automation_guard: { paused: { [automationId]: null } } });
  }

  /** Drop everything stored for a deleted automation. */
  static async forget(automationId: string): Promise<void> {
    await patchMisc({
      automation_policies: { automations: { [automationId]: null } },
      automation_guard: { paused: { [automationId]: null } },
    });
  }
}

export default AutomationPolicyService;
