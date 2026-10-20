// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  parseRoutingAnnotation,
  routingAuditRecord,
} from "../../scripts/agentops/routing-annotation.mjs";

describe("agentops routing annotation", () => {
  it("shapes a valid decision into a run audit row", () => {
    const annotation = parseRoutingAnnotation({
      action: "model.fallback",
      profile: "flash",
      model: "gemini/gemini-2.5-flash",
      tier: "light",
      reasons: ["fallback_rate_limit"],
      fromProfile: "pro",
      errorKind: "rate_limit",
    });

    const row = routingAuditRecord({
      run: { runId: "r-1", workspaceId: "w-1" },
      annotation,
      at: "2026-10-06T00:00:00Z",
    });

    expect(row).toMatchObject({
      action: "model.fallback",
      entityType: "run",
      entityId: "r-1",
      metadata: { runId: "r-1", profile: "flash", errorKind: "rate_limit" },
    });
  });

  it.each([
    [{ action: "model.routed", prompt: "secret text" }],
    [{ action: "model.deleted" }],
    [{ action: "model.routed", reasons: ["Not A Code"] }],
    [{ action: "model.routed", profile: "x".repeat(500) }],
  ])("rejects %j", (body) => {
    expect(() => parseRoutingAnnotation(body)).toThrow();
  });
});
