import { describe, expect, it } from "vitest";

import {
  AGENT_OPS_VRT_VIEWPORTS,
  agentOpsActionMinWidth,
  agentOpsCandidateCardClass,
  agentOpsConsoleViewportClass,
  agentOpsMetricCellStableClass,
  agentOpsQueueRowClass,
  agentOpsTabBarClass,
} from "@/components/studio/agent-ops/shared/agentOpsDimensions";

describe("agentOpsDimensions", () => {
  it("documents VRT reference widths", () => {
    expect(AGENT_OPS_VRT_VIEWPORTS).toEqual([1280, 1440, 1920]);
  });

  it("pins stable layout tokens for regression snapshots", () => {
    expect(agentOpsQueueRowClass).toContain("min-h-[4.5rem]");
    expect(agentOpsCandidateCardClass).toContain("min-h-[12rem]");
    expect(agentOpsTabBarClass).toContain("h-11");
    expect(agentOpsConsoleViewportClass).toMatch(/h-32/);
    expect(agentOpsMetricCellStableClass).toContain("min-h-[3.75rem]");
    expect(agentOpsActionMinWidth.startRun).toContain("min-w-");
  });
});
