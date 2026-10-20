import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepWikiServiceError } from "#/api/deepwiki-service/deepwiki-service.api";
import {
  buildAppCandidates,
  mapModelToDeepWiki,
  withAppRoute,
} from "#/lib/model-routing/app-side";
import { useModelRoutingStore } from "#/stores/model-routing-store";

afterEach(() => {
  useModelRoutingStore.setState({ health: {}, decisions: [], profiles: [] });
});

// @spec MR-012 — App-side routing through DeepWiki
describe("app-side routing", () => {
  it.each([
    ["gemini/gemini-2.5-pro", { provider: "google", model: "gemini-2.5-pro" }],
    [
      "openrouter/anthropic/claude-sonnet-4-5",
      { provider: "openrouter", model: "anthropic/claude-sonnet-4-5" },
    ],
    ["gpt-4o", { provider: "openai", model: "gpt-4o" }],
    ["openhands/glm-5.2", null],
  ])("maps %s for DeepWiki", (model, expected) => {
    expect(mapModelToDeepWiki(model)).toEqual(expected);
  });

  it("only offers providers DeepWiki has keys for", () => {
    const profiles = [
      { name: "gpt", model: "openai/gpt-5", base_url: null, api_key_set: true },
    ];
    const names = buildAppCandidates(profiles, ["google"]).map((c) => c.model);
    expect(names).not.toContain("gpt-5");
    expect(names).toContain("gemini-2.5-flash");
  });

  it("sends a light model for cheap tasks and never a key", async () => {
    const call = vi.fn(async (route: object) => route);
    const route = await withAppRoute("mermaid_repair", call);
    expect(route).toEqual({ provider: "google", model: "gemini-2.5-flash" });
    expect(JSON.stringify(call.mock.calls)).not.toMatch(/api_key|base_url/);
  });

  it("retries once on another model when DeepWiki is rate limited", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new DeepWikiServiceError("429", 429))
      .mockResolvedValueOnce("ok");

    await expect(withAppRoute("kt_ask", call)).resolves.toBe("ok");

    const [[first], [second]] = call.mock.calls;
    expect(first.model).not.toBe(second.model);
    expect(
      useModelRoutingStore.getState().health["deepwiki:google:gemini-2.5-pro"]
        ?.lastErrorKind,
    ).toBe("rate_limit");
  });
});
