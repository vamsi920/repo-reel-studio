import { describe, expect, it, vi } from "vitest";
import type { ProfileInfo } from "@openhands/typescript-client";
import { buildCandidates } from "#/lib/model-routing/catalog";
import {
  createRoutingClassifier,
  parseClassifierLabel,
} from "#/lib/model-routing/classifier";
import {
  classifyLlmError,
  nextFallback,
  parseRetryAfterMs,
} from "#/lib/model-routing/fallback";
import {
  effectiveState,
  isAvailable,
  OUTAGE_FAILURE_THRESHOLD,
  recordFailure,
  recordSuccess,
  type ProfileHealth,
} from "#/lib/model-routing/health";

const NOW = 5_000_000;
const profile = (name: string, model: string): ProfileInfo => ({
  name,
  model,
  base_url: null,
  api_key_set: true,
});

// @spec MR-005 — Profile health circuit breaker
describe("health circuit", () => {
  it("opens on a rate limit, half-opens after the cooldown, closes on success", () => {
    const opened = recordFailure(undefined, "rate_limit", NOW, 10_000);
    expect(isAvailable(opened, NOW + 1)).toBe(false);
    expect(effectiveState(opened, NOW + 10_000)).toBe("half_open");
    expect(effectiveState(recordSuccess(opened, NOW + 10_001), NOW)).toBe(
      "closed",
    );
  });

  it("tolerates isolated outages before opening", () => {
    let health: ProfileHealth | undefined;
    for (let i = 1; i < OUTAGE_FAILURE_THRESHOLD; i += 1) {
      health = recordFailure(health, "unavailable", NOW);
      expect(isAvailable(health, NOW)).toBe(true);
    }
    health = recordFailure(health, "unavailable", NOW);
    expect(isAvailable(health, NOW)).toBe(false);
  });

  it("keeps a profile with bad credentials out until it is reset", () => {
    const health = recordFailure(undefined, "auth", NOW);
    expect(isAvailable(health, NOW + 60 * 60_000)).toBe(false);
  });

  it("does not blame the provider for a context overflow", () => {
    expect(
      isAvailable(recordFailure(undefined, "context_window", NOW), NOW),
    ).toBe(true);
  });
});

// @spec MR-008 — LLM error classification and fallback
describe("fallback", () => {
  it.each([
    ["LLMRateLimitError", "", "rate_limit"],
    ["LLMContextWindowExceedError", "", "context_window"],
    [null, "litellm.RateLimitError: RESOURCE_EXHAUSTED quota", "rate_limit"],
    [null, "503 Service Unavailable: model overloaded", "unavailable"],
    [null, "tool output was malformed", null],
  ])("classifies code=%s detail=%s as %s", (code, detail, kind) => {
    expect(classifyLlmError(code, detail)).toBe(kind);
  });

  it("parses provider retry hints", () => {
    expect(parseRetryAfterMs('"retryDelay": "30s"')).toBe(30_000);
    expect(parseRetryAfterMs("Retry-After: 12")).toBe(12_000);
    expect(parseRetryAfterMs("no hint")).toBeNull();
  });

  const candidates = buildCandidates([
    profile("pro", "gemini/gemini-2.5-pro"),
    profile("sonnet", "anthropic/claude-sonnet-4-5"),
    profile("flash", "gemini/gemini-2.5-flash"),
  ]);
  const byName = (n: string) => candidates.find((c) => c.profileName === n)!;

  it("prefers a same-tier healthy alternative", () => {
    const next = nextFallback({
      current: byName("pro"),
      kind: "rate_limit",
      candidates,
      health: {},
      tried: [],
      now: NOW,
    });
    expect(next?.profileName).toBe("sonnet");
  });

  it("only moves to a larger window after a context overflow", () => {
    const next = nextFallback({
      current: byName("sonnet"),
      kind: "context_window",
      candidates,
      health: {},
      tried: [],
      now: NOW,
    });
    expect(next?.contextWindow).toBeGreaterThan(byName("sonnet").contextWindow);
  });

  it("returns null when every alternative was tried or is down", () => {
    const next = nextFallback({
      current: byName("pro"),
      kind: "unavailable",
      candidates,
      health: { flash: recordFailure(undefined, "rate_limit", NOW) },
      tried: ["sonnet"],
      now: NOW,
    });
    expect(next).toBeNull();
  });
});

// @spec MR-009 — Ambiguity classifier
describe("classifier bounds", () => {
  it("parses one-word labels", () => {
    expect(parseClassifierLabel(" heavy\n")).toBe("frontier");
    expect(parseClassifierLabel("LIGHT")).toBe("light");
    expect(parseClassifierLabel("maybe?")).toBeNull();
  });

  it("caches answers and enforces the hourly cap", async () => {
    const transport = { classify: vi.fn(async () => "standard" as const) };
    const classifier = createRoutingClassifier(transport, {
      maxCallsPerHour: 2,
    });

    await classifier.classify("a");
    await classifier.classify("a");
    await classifier.classify("b");
    const capped = await classifier.classify("c");

    expect(transport.classify).toHaveBeenCalledTimes(2);
    expect(capped).toBeNull();
  });

  it("gives up after the timeout so the scorer decides", async () => {
    const transport = {
      classify: () => new Promise<null>(() => {}),
    };
    const classifier = createRoutingClassifier(transport, { timeoutMs: 5 });
    await expect(classifier.classify("slow")).resolves.toBeNull();
  });
});
