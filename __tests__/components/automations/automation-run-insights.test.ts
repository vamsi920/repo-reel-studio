import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastRunText } from "#/components/features/automations/automation-run-insights";

const copy = { label: "Last run", never: "Never run", justNow: "Just now" };

describe("lastRunText", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
  });

  it("renders a delta for a valid started_at", () => {
    expect(lastRunText("2025-12-31T00:00:00Z", null, copy, "ago")).toBe(
      "1d ago",
    );
  });

  it("falls back to the automation's last_triggered_at when the run's own timestamp is the epoch placeholder for a still-PENDING run", () => {
    // The automation service leaves `started_at` as epoch/zero while a run
    // is dispatched but not yet started (same convention as
    // `activity-log-item.tsx`'s `isInvalidTimestamp` and
    // `automation-run-health.ts`'s `getLastRunTimestamp`). Without the
    // fallback this used to render a nonsense multi-decade delta instead of
    // the automation's last known trigger time.
    expect(
      lastRunText(
        "1970-01-01T00:00:00Z",
        "2025-12-31T00:00:00Z",
        copy,
        "ago",
      ),
    ).toBe("1d ago");
  });

  it("renders 'never' when both the run's timestamp and the fallback are epoch/invalid", () => {
    expect(
      lastRunText("1970-01-01T00:00:00Z", "1970-01-01T00:00:00Z", copy, "ago"),
    ).toBe(copy.never);
  });

  it("renders 'never' when neither timestamp is provided", () => {
    expect(lastRunText(null, undefined, copy, "ago")).toBe(copy.never);
  });

  it("renders 'just now' for a delta under a minute", () => {
    expect(lastRunText("2025-12-31T23:59:59Z", null, copy, "ago")).toBe(
      copy.justNow,
    );
  });
});
