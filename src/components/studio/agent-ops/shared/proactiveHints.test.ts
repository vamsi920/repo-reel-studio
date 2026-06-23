import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatBatchStatusLabel,
  proactiveDispatchLabel,
  proactiveShortfallReason,
} from "@/components/studio/agent-ops/shared/proactiveHints";
import { makeProactiveBatch, makeProactiveStatus } from "@/components/studio/agent-ops/test/proactiveTestFixtures";

describe("proactiveHints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("proactiveDispatchLabel", () => {
    it("shows last scan when dispatch completed", () => {
      const batch = makeProactiveBatch({
        dispatchCompletedAt: "2026-05-27T14:30:00.000Z",
      });
      expect(proactiveDispatchLabel(batch, true, 6, "09:00")).toBe("Last scan 30m");
    });

    it("shows scanning when dispatch started but not completed", () => {
      const batch = makeProactiveBatch({
        dispatchStartedAt: "2026-05-27T14:45:00.000Z",
        dispatchCompletedAt: null,
      });
      expect(proactiveDispatchLabel(batch, true, 6, "09:00")).toBe("Scanning since 15m");
    });

    it("shows paused copy when disabled", () => {
      expect(proactiveDispatchLabel(null, false, 6, "09:00")).toBe("Off — enable before 09:00");
    });

    it("shows idle copy when enabled without batch activity", () => {
      expect(proactiveDispatchLabel(null, true, 6, "09:00")).toBe("No scan yet");
    });
  });

  describe("formatBatchStatusLabel", () => {
    it("returns loading placeholder", () => {
      expect(formatBatchStatusLabel(null, true)).toBe("Loading");
    });

    it("marks in-flight batches as running", () => {
      const batch = makeProactiveBatch({
        status: "dispatching",
        dispatchStartedAt: "2026-05-27T14:00:00.000Z",
        dispatchCompletedAt: null,
      });
      expect(formatBatchStatusLabel(batch, false)).toBe("dispatching · running");
    });
  });

  describe("proactiveShortfallReason", () => {
    it("prefers status shortfall over batch metrics", () => {
      const status = makeProactiveStatus({
        shortfallReason: "Not enough signals",
        batch: makeProactiveBatch({
          metrics: { qualityMode: "high", averageScore: 0, shortfallReason: "Batch shortfall" },
        }),
      });
      expect(proactiveShortfallReason(status)).toBe("Not enough signals");
    });
  });
});
