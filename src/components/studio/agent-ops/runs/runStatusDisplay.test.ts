import { describe, expect, it } from "vitest";

import {
  resolveRunStatusDisplay,
  runStatusBadgeClass,
  runStatusLabel,
} from "@/components/studio/agent-ops/runs/runStatusDisplay";

describe("runStatusDisplay", () => {
  it("maps known run statuses", () => {
    expect(resolveRunStatusDisplay("awaiting_review")).toMatchObject({
      known: true,
      label: "Awaiting review",
      tone: "review",
    });
    expect(resolveRunStatusDisplay("cancelled")).toMatchObject({
      known: true,
      tone: "muted",
    });
  });

  it("normalizes hyphenated statuses", () => {
    expect(resolveRunStatusDisplay("awaiting-review").key).toBe("awaiting_review");
  });

  it("degrades unknown statuses gracefully", () => {
    const display = resolveRunStatusDisplay("mystery_phase");
    expect(display.known).toBe(false);
    expect(display.label).toBe("Mystery Phase");
    expect(display.tone).toBe("neutral");
    expect(runStatusBadgeClass("mystery_phase")).toContain("border-dashed");
  });

  it("runStatusLabel supports short variant", () => {
    expect(runStatusLabel("awaiting_review", "short")).toBe("Review");
  });
});
