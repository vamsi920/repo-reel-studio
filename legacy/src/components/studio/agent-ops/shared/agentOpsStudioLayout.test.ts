import { describe, expect, it } from "vitest";

import {
  agentOpsStudioEmbedClass,
  agentOpsStudioSectionClass,
} from "@/components/studio/agent-ops/shared/agentOpsLayout";

describe("agentOpsStudioLayout", () => {
  it("aligns Agent Ops section floor with Studio graph view", () => {
    expect(agentOpsStudioSectionClass).toContain("min-h-[680px]");
  });

  it("embeds as flex column without nested page shell panel", () => {
    expect(agentOpsStudioEmbedClass).toContain("flex flex-col");
    expect(agentOpsStudioEmbedClass).not.toContain("gf-panel");
  });
});
