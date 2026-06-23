import { describe, expect, it } from "vitest";

import type { ProactiveLinkedRunSummary } from "@/lib/proactiveAgentOps";

import {
  findSelectedProactiveCandidate,
  isProactiveWorkActive,
  reconcileProactiveSelection,
  resolveProactiveReadyCount,
} from "@/components/studio/agent-ops/agentRunsPanelHelpers";
import {
  makeProactiveBatch,
  makeProactiveCandidate,
  makeProactiveStatus,
} from "@/components/studio/agent-ops/test/proactiveTestFixtures";

describe("agentRunsPanelHelpers", () => {
  describe("resolveProactiveReadyCount", () => {
    it("reads ready from status and defaults to zero", () => {
      expect(resolveProactiveReadyCount(null)).toBe(0);
      expect(resolveProactiveReadyCount(makeProactiveStatus({ ready: 3 }))).toBe(3);
    });
  });

  describe("reconcileProactiveSelection", () => {
    const candidates = [
      makeProactiveCandidate("c1"),
      makeProactiveCandidate("c2"),
    ];

    it("clears selection when candidate list is empty", () => {
      expect(reconcileProactiveSelection([], "c1")).toBeNull();
    });

    it("keeps valid selection", () => {
      expect(reconcileProactiveSelection(candidates, "c2")).toBe("c2");
    });

    it("falls back to first candidate when selection is missing or stale", () => {
      expect(reconcileProactiveSelection(candidates, null)).toBe("c1");
      expect(reconcileProactiveSelection(candidates, "missing")).toBe("c1");
    });
  });

  describe("findSelectedProactiveCandidate", () => {
    const candidates = [makeProactiveCandidate("c1"), makeProactiveCandidate("c2")];

    it("returns null without a selection id", () => {
      expect(findSelectedProactiveCandidate(candidates, null)).toBeNull();
    });

    it("returns the matching candidate", () => {
      expect(findSelectedProactiveCandidate(candidates, "c2")?.title).toBe("Candidate c2");
    });
  });

  describe("isProactiveWorkActive", () => {
    it("is true while dispatch action runs", () => {
      expect(isProactiveWorkActive(null, "dispatch")).toBe(true);
    });

    it("is true for non-terminal batch status", () => {
      const status = makeProactiveStatus({
        batch: makeProactiveBatch({ status: "running" }),
      });
      expect(isProactiveWorkActive(status, null)).toBe(true);
    });

    it("is false for terminal batch with idle candidates", () => {
      const status = makeProactiveStatus({
        batch: makeProactiveBatch({ status: "complete" }),
        candidates: [makeProactiveCandidate("c1", { status: "review_ready" })],
      });
      expect(isProactiveWorkActive(status, null)).toBe(false);
    });

    it("is true when a candidate is executing", () => {
      const status = makeProactiveStatus({
        candidates: [makeProactiveCandidate("c1", { status: "executing" })],
      });
      expect(isProactiveWorkActive(status, null)).toBe(true);
    });

    it("is true when linked run is still active", () => {
      const status = makeProactiveStatus({
        candidates: [
          makeProactiveCandidate("c1", {
            status: "review_ready",
            linkedRun: { id: "run-1", status: "running" } as ProactiveLinkedRunSummary,
          }),
        ],
      });
      expect(isProactiveWorkActive(status, null)).toBe(true);
    });
  });
});
