import { afterEach, describe, expect, it, vi } from "vitest";
import AutomationPolicyService from "#/api/automation-policy-service";

const { updateSettings } = vi.hoisted(() => ({
  updateSettings: vi.fn().mockResolvedValue({}),
}));
vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: class {
    updateSettings = updateSettings;
  },
}));

describe("AutomationPolicyService", () => {
  afterEach(() => updateSettings.mockClear());

  it.each([
    [
      "stores a policy with limits",
      { daily_budget_usd: 3, max_runs_per_hour: null },
      { daily_budget_usd: 3, max_runs_per_hour: null },
    ],
    // The settings diff deep-merges and null deletes, so "no limits" must
    // remove the policy rather than leave an empty object the guard enforces.
    [
      "removes a policy without limits",
      { daily_budget_usd: null, skip_overlapping_runs: false },
      null,
    ],
  ])("%s", async (_label, policy, stored) => {
    await AutomationPolicyService.savePolicy("a1", policy);

    expect(updateSettings).toHaveBeenCalledWith({
      misc_settings_diff: {
        automation_policies: { automations: { a1: stored } },
      },
    });
  });
});
