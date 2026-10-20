import { describe, expect, it } from "vitest";
import type { ProfileInfo } from "@openhands/typescript-client";
import {
  buildCandidates,
  lookupModelCapabilities,
} from "#/lib/model-routing/catalog";
import { extractPromptFeatures } from "#/lib/model-routing/features";
import { recordFailure } from "#/lib/model-routing/health";
import {
  route,
  routeSync,
  type RoutingContext,
} from "#/lib/model-routing/router";
import { scoreComplexity, tierForScore } from "#/lib/model-routing/scorer";
import type { RouteRequest } from "#/lib/model-routing/types";

const NOW = 1_000_000;

const profile = (name: string, model: string): ProfileInfo => ({
  name,
  model,
  base_url: null,
  api_key_set: true,
});

const PROFILES = [
  profile("pro", "gemini/gemini-2.5-pro"),
  profile("flash", "gemini/gemini-2.5-flash"),
];

const ctx = (overrides: Partial<RoutingContext> = {}): RoutingContext => ({
  candidates: buildCandidates(PROFILES),
  policy: "balanced",
  budgetUsd: null,
  excludedProfiles: [],
  health: {},
  now: NOW,
  ...overrides,
});

const HARD_PROMPT =
  "Refactor the payment service architecture across the entire codebase, " +
  "migrate src/payments/api.ts and src/billing/client.ts to gRPC, and debug " +
  "the race condition in the retry loop.";

const chat = (overrides: Partial<RouteRequest> = {}): RouteRequest => ({
  task: "chat_turn",
  needsTools: true,
  ...overrides,
});

// @spec MR-002 — Capability catalog
describe("catalog", () => {
  it("matches the most specific model family", () => {
    expect(lookupModelCapabilities("gemini/gemini-2.5-flash-lite").tier).toBe(
      "light",
    );
    expect(lookupModelCapabilities("anthropic/claude-opus-4-5").tier).toBe(
      "frontier",
    );
  });

  it("treats unknown models conservatively", () => {
    const caps = lookupModelCapabilities("acme/mystery-1");
    expect(caps).toMatchObject({ tier: "standard", vision: false });
  });
});

// @spec MR-004 — Complexity scorer and policy thresholds
describe("scorer", () => {
  it("rates a multi-file refactor as frontier and a trivial ack as light", () => {
    const hard = scoreComplexity(extractPromptFeatures(HARD_PROMPT));
    const easy = scoreComplexity(extractPromptFeatures("thanks!"));
    expect(tierForScore(hard, "balanced")).toBe("frontier");
    expect(tierForScore(easy, "balanced")).toBe("light");
  });

  it("lets the policy move the same prompt between tiers", () => {
    const score = 0.45;
    expect(tierForScore(score, "quality")).toBe("frontier");
    expect(tierForScore(score, "economy")).toBe("light");
  });
});

// @spec MR-010 — Hybrid router
describe("routeSync", () => {
  it("sends a complex request to the frontier profile", () => {
    const { decision } = routeSync(chat({ text: HARD_PROMPT }), ctx());
    expect(decision.profileName).toBe("pro");
    expect(decision.reasons).toContain("complex_task");
  });

  it("keeps the current profile for a trivial follow-up", () => {
    const { decision } = routeSync(
      chat({ text: "ok", currentProfile: "pro" }),
      ctx(),
    );
    expect(decision).toMatchObject({ profileName: "pro", switched: false });
    expect(decision.reasons).toContain("trivial_followup");
  });

  it("lets a manual override win over everything", () => {
    const { decision } = routeSync(
      chat({ text: HARD_PROMPT, overrideProfile: "flash" }),
      ctx({ excludedProfiles: ["flash"] }),
    );
    expect(decision).toMatchObject({
      profileName: "flash",
      source: "override",
    });
  });

  it("never picks an excluded profile on its own", () => {
    const { decision } = routeSync(
      chat({ text: HARD_PROMPT }),
      ctx({ excludedProfiles: ["pro"] }),
    );
    expect(decision.profileName).toBe("flash");
    expect(decision.rejected).toContainEqual({
      profileName: "pro",
      reason: "excluded",
    });
  });

  it("skips a profile whose circuit is open", () => {
    const health = { pro: recordFailure(undefined, "rate_limit", NOW) };
    const { decision } = routeSync(
      chat({ text: HARD_PROMPT }),
      ctx({ health }),
    );
    expect(decision.profileName).toBe("flash");
  });

  it("forces a vision-capable model when an image is attached", () => {
    const candidates = buildCandidates([
      profile("text-only", "deepseek/deepseek-chat"),
      profile("flash", "gemini/gemini-2.5-flash"),
    ]);
    const { decision } = routeSync(
      chat({
        text: "what is in this screenshot?",
        hasImages: true,
        currentProfile: "text-only",
      }),
      ctx({ candidates }),
    );
    expect(decision.profileName).toBe("flash");
    expect(decision.reasons).toContain("vision_required");
  });

  it("downshifts as the conversation nears its budget", () => {
    const { decision } = routeSync(
      chat({ text: HARD_PROMPT, conversationCostUsd: 9 }),
      ctx({ budgetUsd: 10 }),
    );
    expect(decision.reasons).toContain("budget_downshift");
    expect(decision.profileName).toBe("flash");
  });

  it("uses fixed tiers for app-side tasks", () => {
    expect(routeSync({ task: "kt_generate" }, ctx()).decision.profileName).toBe(
      "pro",
    );
    expect(
      routeSync({ task: "mermaid_repair" }, ctx()).decision.profileName,
    ).toBe("flash");
  });
});

// @spec MR-007 — Sticky routing / hysteresis
describe("hysteresis", () => {
  const moderate = "Can you explain briefly how the auth module works?";

  it("upgrades immediately but holds a first downgrade verdict", () => {
    const up = routeSync(
      chat({ text: HARD_PROMPT, currentProfile: "flash" }),
      ctx({
        sticky: {
          turnsSinceSwitch: 0,
          lastSwitchAt: NOW,
          consecutiveLowerVerdicts: 0,
        },
      }),
    );
    expect(up.decision).toMatchObject({ profileName: "pro", switched: true });

    const down = routeSync(
      chat({ text: moderate, currentProfile: "pro" }),
      ctx({
        sticky: {
          turnsSinceSwitch: 0,
          lastSwitchAt: NOW,
          consecutiveLowerVerdicts: 0,
        },
      }),
    );
    expect(down.decision).toMatchObject({
      profileName: "pro",
      switched: false,
    });
    expect(down.decision.reasons).toContain("sticky_hold");
  });

  it("downgrades after repeated lighter verdicts and enough dwell", () => {
    const { decision } = routeSync(
      chat({ text: "summarize the readme quickly", currentProfile: "pro" }),
      ctx({
        sticky: {
          turnsSinceSwitch: 5,
          lastSwitchAt: NOW,
          consecutiveLowerVerdicts: 1,
        },
      }),
    );
    expect(decision).toMatchObject({ profileName: "flash", switched: true });
  });
});

// @spec MR-009 — Ambiguity classifier
describe("route (classifier)", () => {
  const makeClassifier = () => {
    const calls: string[] = [];
    return {
      calls,
      classify: async (text: string) => {
        calls.push(text);
        return "frontier" as const;
      },
    };
  };

  it("skips the classifier when the score is decisive", async () => {
    const classifier = makeClassifier();
    await route(chat({ text: HARD_PROMPT }), ctx(), classifier);
    expect(classifier.calls).toHaveLength(0);
  });

  it("lets the classifier decide an ambiguous prompt", async () => {
    const classifier = makeClassifier();
    const ambiguous = "add a dark mode toggle to the settings page";
    expect(routeSync(chat({ text: ambiguous }), ctx()).needsClassifier).toBe(
      true,
    );

    const { decision } = await route(
      chat({ text: ambiguous }),
      ctx(),
      classifier,
    );

    expect(classifier.calls).toEqual([ambiguous]);
    expect(decision).toMatchObject({
      source: "classifier",
      profileName: "pro",
    });
  });
});
