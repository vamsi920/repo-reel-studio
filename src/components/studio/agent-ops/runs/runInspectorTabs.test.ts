import { describe, expect, it } from "vitest";

import { normalizeRunDetailTab, RUN_DETAIL_TABS } from "@/components/studio/agent-ops/runs/runInspectorTabs";

describe("runInspectorTabs", () => {
  it("exposes five grouped run inspector tabs", () => {
    expect(RUN_DETAIL_TABS.map((tab) => tab.id)).toEqual(["summary", "patch", "checks", "ship", "map"]);
  });

  it("normalizes legacy tab ids", () => {
    expect(normalizeRunDetailTab("overview")).toBe("summary");
    expect(normalizeRunDetailTab("validation")).toBe("checks");
    expect(normalizeRunDetailTab("pr")).toBe("ship");
    expect(normalizeRunDetailTab("mission")).toBe("map");
  });
});
