import { describe, expect, it } from "vitest";

import {
  agentOpsBusyDotClass,
  agentOpsChevronClass,
  agentOpsOperationFadeClass,
  agentOpsSpinnerClass,
  agentOpsTransitionClass,
  agentOpsTransitionSlowClass,
} from "@/components/studio/agent-ops/shared/agentOpsMotion";

describe("agentOpsMotion", () => {
  it("respects prefers-reduced-motion on transitions and spinners", () => {
    for (const token of [
      agentOpsTransitionClass,
      agentOpsTransitionSlowClass,
      agentOpsChevronClass,
      agentOpsSpinnerClass,
      agentOpsOperationFadeClass,
    ]) {
      expect(token).toContain("motion-reduce:");
    }
  });

  it("uses a static busy dot without pulse animation", () => {
    expect(agentOpsBusyDotClass).not.toContain("animate");
    expect(agentOpsBusyDotClass).not.toContain("pulse");
  });
});
