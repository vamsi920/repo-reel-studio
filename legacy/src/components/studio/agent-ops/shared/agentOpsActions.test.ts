import { describe, expect, it } from "vitest";

import {
  approveCandidateDisabledReason,
  runScanDisabledReason,
  startRunDisabledReason,
} from "./agentOpsActions";

describe("agentOpsActions", () => {
  it("startRunDisabledReason explains missing input", () => {
    expect(startRunDisabledReason({ isGitHub: true, hasIssueUrl: false, submitting: false })).toMatch(/issue URL/i);
    expect(startRunDisabledReason({ isGitHub: false, hasIssueUrl: true, submitting: false })).toMatch(/GitHub/i);
  });

  it("runScanDisabledReason explains lock states", () => {
    expect(runScanDisabledReason({ dispatching: true, controlsLocked: true })).toMatch(/progress/i);
    expect(runScanDisabledReason({ dispatching: false, controlsLocked: true })).toMatch(/Wait/i);
  });

  it("approveCandidateDisabledReason surfaces policy block", () => {
    expect(approveCandidateDisabledReason({ policyBlocked: true, approving: false })).toMatch(/Policy/i);
    expect(
      approveCandidateDisabledReason({
        policyBlocked: true,
        approving: false,
        policySummary: "Secret path touched",
      }),
    ).toBe("Secret path touched");
  });
});
