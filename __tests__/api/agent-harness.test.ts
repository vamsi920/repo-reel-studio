import { describe, expect, it } from "vitest";
import {
  HARNESS_TOOL_CONCURRENCY,
  buildHarnessSettingsDiff,
} from "#/api/agent-harness";

describe("buildHarnessSettingsDiff", () => {
  it("turns on sub-agents and parallel tool calls for stock settings", () => {
    expect(
      buildHarnessSettingsDiff({
        agent_kind: "openhands",
        enable_sub_agents: false,
        tool_concurrency_limit: 1,
        llm: { model: "gemini/gemini-2.5-pro" },
      }),
    ).toEqual({
      enable_sub_agents: true,
      tool_concurrency_limit: HARNESS_TOOL_CONCURRENCY,
    });
  });

  it("enables the critic only for All-Hands proxy models", () => {
    expect(
      buildHarnessSettingsDiff({
        enable_sub_agents: true,
        tool_concurrency_limit: HARNESS_TOOL_CONCURRENCY,
        llm: { model: "openhands/claude-sonnet" },
      }),
    ).toEqual({
      verification: { critic_enabled: true, enable_iterative_refinement: true },
    });
  });

  it("never lowers a user's higher limit and leaves ACP agents alone", () => {
    expect(
      buildHarnessSettingsDiff({
        enable_sub_agents: true,
        tool_concurrency_limit: 8,
        llm: { model: "x/y" },
      }),
    ).toBeNull();
    expect(buildHarnessSettingsDiff({ agent_kind: "acp" })).toBeNull();
  });
});
