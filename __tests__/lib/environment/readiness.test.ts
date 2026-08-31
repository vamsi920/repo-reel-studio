import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  EMPTY_EVIDENCE,
  type ReadinessEvidence,
} from "#/lib/environment/requirements/readiness";
import { createEmptyProfile } from "#/lib/environment/types/profile";
import type { ProbeResult } from "#/lib/environment/types/probe";

const NOW = "2026-08-30T00:00:00.000Z";

function probe(ok: boolean): ProbeResult {
  return { ok, vantage: "edge", latencyMs: 1, checks: [], probedAt: NOW };
}

describe("readiness", () => {
  it("reports everything as unknown when nothing has been probed", () => {
    const report = computeReadiness(EMPTY_EVIDENCE, null, NOW);
    expect(report.blocking).toEqual([]);
    expect(report.degrading).toEqual([]);
    expect(report.unknown.length).toBeGreaterThan(0);
  });

  it("never presents an unchecked requirement as a failure", () => {
    // The distinction the whole screen rests on: "we did not look" and "it is
    // broken" must not render the same, or people learn to ignore red.
    const report = computeReadiness(EMPTY_EVIDENCE, null, NOW);
    const ids = new Set(report.blocking.map((item) => item.id));
    for (const item of report.unknown) expect(ids.has(item.id)).toBe(false);
  });

  it("scores a fully satisfied environment at 100", () => {
    const base = computeReadiness(EMPTY_EVIDENCE, null, NOW);
    const evidence: ReadinessEvidence = {
      probes: Object.fromEntries(
        base.unknown
          .filter((item) => item.node.kind !== "capability")
          .map((item) => [
            item.id.slice(item.id.indexOf(":") + 1),
            probe(true),
          ]),
      ),
      capabilities: {
        "source-control": "ok",
        "issue-tracker": "ok",
        llm: "ok",
        "vector-store": "ok",
        "object-storage": "ok",
        "relational-db": "ok",
      },
    };
    const report = computeReadiness(evidence, null, NOW);
    expect(report.blocking).toEqual([]);
    expect(report.score).toBe(100);
  });

  it("weighs a blocking failure more heavily than a degrading one", () => {
    const capabilities = {
      "source-control": "missing",
      "issue-tracker": "ok",
      llm: "ok",
      "vector-store": "ok",
      "object-storage": "ok",
      "relational-db": "ok",
    } as const;

    const blockingReport = computeReadiness(
      { probes: {}, capabilities },
      null,
      NOW,
    );
    const cleanReport = computeReadiness(
      { probes: {}, capabilities: { ...capabilities, "source-control": "ok" } },
      null,
      NOW,
    );
    expect(blockingReport.score).toBeLessThan(cleanReport.score);
    expect(blockingReport.blocking.length).toBeGreaterThan(0);
  });

  it("treats a mirrored host as satisfied rather than missing", () => {
    // An air-gapped install that has mirrored npm has not failed the npm
    // requirement; reporting it as a blocker would bury the real problems
    // under a dozen false ones.
    const profile = createEmptyProfile("org", NOW);
    profile.network.mirrors = { "registry.npmjs.org": "nexus.corp/npm" };

    const withMirror = computeReadiness(EMPTY_EVIDENCE, profile, NOW);
    const mirrored = withMirror.unknown.find(
      (item) =>
        item.node.kind === "egress" && item.node.host === "registry.npmjs.org",
    );
    expect(mirrored).toBeUndefined();
  });

  it("does not put Fly container variables on a SaaS tenant's checklist", () => {
    const profile = createEmptyProfile("org", NOW);
    profile.mode = "saas";
    const report = computeReadiness(EMPTY_EVIDENCE, profile, NOW);
    const flyItems = [
      ...report.blocking,
      ...report.degrading,
      ...report.unknown,
    ].filter((item) => item.node.kind === "env" && item.node.scope === "fly");
    expect(flyItems).toEqual([]);
  });

  it("drops the inbound requirement once polling is in use", () => {
    const profile = createEmptyProfile("org", NOW);
    profile.network.inbound.pollingFallback = true;
    const report = computeReadiness(EMPTY_EVIDENCE, profile, NOW);
    const inbound = [
      ...report.blocking,
      ...report.degrading,
      ...report.unknown,
    ].filter((item) => item.node.kind === "inbound");
    expect(inbound).toEqual([]);
  });
});
