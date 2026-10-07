import type { SettingsValue } from "#/types/settings";

/**
 * NeoDevEx agent-harness defaults applied to the OpenHands agent settings.
 *
 * - **Parallel tool calls**: independent tool calls from one LLM response run
 *   at the same time (the SDK's `tool_concurrency_limit`; 1 = sequential).
 * - **Sub-agents**: the `task_tool_set` is attached so the agent can fan
 *   independent work out to the `neo-*` specialists shipped in
 *   `config/harness/agents/` (installed by `scripts/install-harness.mjs`).
 * - **Critic self-review**: only for `openhands/` (All-Hands proxy) models —
 *   the SDK critic is a hosted scoring service authenticated with that key.
 *   Other models get self-review from the `neo-verifier` sub-agent instead,
 *   driven by the always-on `neo-harness` playbook.
 */
export const HARNESS_VERSION = 1;
export const HARNESS_TOOL_CONCURRENCY = 4;
const CRITIC_CAPABLE_MODEL_PREFIX = "openhands/";

export const HARNESS_MIGRATION_KEY_PREFIX = "neodevex-harness-applied:";

export function harnessMigrationKey(backendId: string): string {
  return `${HARNESS_MIGRATION_KEY_PREFIX}v${HARNESS_VERSION}:${backendId}`;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The `agent_settings_diff` that turns the harness on for stored agent
 * settings, or null when everything is already on. Only ever turns things
 * ON — it never lowers a concurrency limit the user raised themselves.
 */
export function buildHarnessSettingsDiff(
  agentSettings: Record<string, unknown> | null | undefined,
): Record<string, SettingsValue> | null {
  const settings = asRecord(agentSettings);
  if (settings.agent_kind && settings.agent_kind !== "openhands") return null;

  const diff: Record<string, SettingsValue> = {};
  if (settings.enable_sub_agents !== true) diff.enable_sub_agents = true;

  const concurrency = settings.tool_concurrency_limit;
  if (
    typeof concurrency !== "number" ||
    concurrency < HARNESS_TOOL_CONCURRENCY
  ) {
    diff.tool_concurrency_limit = HARNESS_TOOL_CONCURRENCY;
  }

  const model = asRecord(settings.llm).model;
  const verification = asRecord(settings.verification);
  if (
    typeof model === "string" &&
    model.startsWith(CRITIC_CAPABLE_MODEL_PREFIX) &&
    verification.critic_enabled !== true
  ) {
    diff.verification = {
      critic_enabled: true,
      enable_iterative_refinement: true,
    };
  }

  return Object.keys(diff).length > 0 ? diff : null;
}
