import { describe, expect, it } from "vitest";

import { proactiveCandidateRadioTabIndex, statusAriaLabel } from "./agentOpsA11y";

describe("agentOpsA11y", () => {
  it("statusAriaLabel prefixes category", () => {
    expect(statusAriaLabel("Status", "Review ready")).toBe("Status: Review ready");
  });

  it("proactiveCandidateRadioTabIndex roves to selection or first", () => {
    const ids = ["a", "b", "c"] as const;
    expect(proactiveCandidateRadioTabIndex("b", "b", ids)).toBe(0);
    expect(proactiveCandidateRadioTabIndex("a", "b", ids)).toBe(-1);
    expect(proactiveCandidateRadioTabIndex("a", null, ids)).toBe(0);
    expect(proactiveCandidateRadioTabIndex("b", null, ids)).toBe(-1);
  });
});
