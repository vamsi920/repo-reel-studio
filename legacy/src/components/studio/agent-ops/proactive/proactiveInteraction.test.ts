import { describe, expect, it } from "vitest";

import { mergeProactiveBackendAttention, nextProactiveSelectionAfterDismiss } from "@/components/studio/agent-ops/proactive/proactiveInteraction";
import {
  makeProactiveCandidate,
  makeProactiveStatus,
} from "@/components/studio/agent-ops/test/proactiveTestFixtures";

describe("proactiveInteraction", () => {
  it("mergeProactiveBackendAttention keeps load errors when health is OK", () => {
    const previous = {
      kind: "generic" as const,
      title: "Unavailable",
      message: "Proactive backend is unavailable.",
    };
    expect(mergeProactiveBackendAttention(null, previous, true)).toBe(previous);
    expect(mergeProactiveBackendAttention(null, previous, false)).toBeNull();
  });

  it("mergeProactiveBackendAttention prefers health attention", () => {
    const fromHealth = {
      kind: "proactive_routes_missing" as const,
      title: "Missing routes",
      message: "No proactive API",
    };
    const previous = {
      kind: "generic" as const,
      title: "Unavailable",
      message: "fetch failed",
    };
    expect(mergeProactiveBackendAttention(fromHealth, previous, true)).toBe(fromHealth);
  });

  it("nextProactiveSelectionAfterDismiss moves to next candidate", () => {
    const c1 = makeProactiveCandidate("c1");
    const c2 = makeProactiveCandidate("c2");
    const status = makeProactiveStatus({ candidates: [c1, c2] });
    const next = nextProactiveSelectionAfterDismiss(
      { ...status, candidates: [c2] },
      "c1",
      "c1",
    );
    expect(next).toBe("c2");
  });
});
