import { describe, expect, it } from "vitest";

import {
  proactiveStatusBadgeClass,
  resolveProactiveStatusDisplay,
  resolveProactiveTypeDisplay,
} from "@/components/studio/agent-ops/proactive/proactiveStatusDisplay";

describe("proactiveStatusDisplay", () => {
  it("maps primary proactive statuses", () => {
    expect(resolveProactiveStatusDisplay("review_ready")).toMatchObject({
      known: true,
      label: "Review ready",
      tone: "success",
    });
    expect(resolveProactiveStatusDisplay("executing")).toMatchObject({
      known: true,
      tone: "active",
    });
    expect(resolveProactiveStatusDisplay("dismissed")).toMatchObject({
      known: true,
      tone: "muted",
    });
  });

  it("maps execution failure overrides for needs_execution", () => {
    expect(
      resolveProactiveStatusDisplay("needs_execution", {
        isNoPatch: true,
        isBackendCrash: false,
        label: "No patch",
        reason: "empty",
      }),
    ).toMatchObject({ label: "No patch", tone: "review", known: true });

    expect(
      resolveProactiveStatusDisplay("needs_execution", {
        isNoPatch: false,
        isBackendCrash: true,
        label: "Crash",
        reason: "boom",
      }),
    ).toMatchObject({ label: "Executor error", tone: "danger", known: true });
  });

  it("degrades unknown statuses and types", () => {
    const status = resolveProactiveStatusDisplay("future_state");
    expect(status.known).toBe(false);
    expect(status.label).toBe("Future State");
    expect(proactiveStatusBadgeClass("future_state")).toContain("border-dashed");

    const type = resolveProactiveTypeDisplay("custom_kind");
    expect(type.known).toBe(false);
    expect(type.label).toBe("Custom Kind");
  });

  it("maps known candidate types", () => {
    expect(resolveProactiveTypeDisplay("reliability")).toMatchObject({
      known: true,
      label: "Reliability",
      tone: "review",
    });
  });
});
