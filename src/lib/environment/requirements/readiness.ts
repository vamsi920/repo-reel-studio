import type { Capability } from "../types/capability";
import type { ProbeResult } from "../types/probe";
import type { DeploymentMode, EnvironmentProfile } from "../types/profile";
import type {
  CapabilityStatus,
  ReadinessItem,
  ReadinessReport,
  RequirementNode,
  RequirementStatus,
} from "../types/requirements";
import { REQUIREMENT_WEIGHT } from "../types/requirements";
import {
  FEATURE_REQUIREMENTS,
  requirementNodeId,
} from "./feature-requirements";

/**
 * Evidence gathered from probes, connections and the profile. Deliberately a
 * plain lookup rather than a service: readiness scoring is pure, so it can be
 * tested without mocking the network, and the same function runs against a
 * bundle imported from another install.
 */
export interface ReadinessEvidence {
  /** Requirement node id -> probe result that proved (or disproved) it. */
  probes: Record<string, ProbeResult>;
  /** Capability -> whether a connection exists and how healthy it is. */
  capabilities: Partial<Record<Capability, CapabilityStatus>>;
}

export const EMPTY_EVIDENCE: ReadinessEvidence = {
  probes: {},
  capabilities: {},
};

/**
 * Requirements a deployment mode makes moot. This is what stops an air-gapped
 * install from reporting fifteen blocking failures for hosts it is never
 * supposed to reach -- those are not defects, they are the point.
 */
function isNotApplicable(
  node: RequirementNode,
  profile: EnvironmentProfile | null,
): boolean {
  if (!profile) return false;
  const mode: DeploymentMode = profile.mode;

  if (node.kind === "egress") {
    if (profile.network.mirrors[node.host]) return true;
    if (mode === "air-gapped") {
      // An air-gapped install without a mirror genuinely cannot satisfy this,
      // so it stays applicable and surfaces as a real blocker.
      return false;
    }
  }

  if (node.kind === "inbound" && profile.network.inbound.pollingFallback) {
    // Inbound was probed, found blocked, and the install switched to polling.
    return true;
  }

  if (node.kind === "env" && node.scope === "fly" && mode === "saas") {
    // A SaaS tenant does not own the container; this is our problem, not
    // something to put on their checklist.
    return true;
  }

  return false;
}

function statusFromEvidence(
  node: RequirementNode,
  evidence: ReadinessEvidence,
): { status: RequirementStatus; probe?: ProbeResult } {
  if (node.kind === "capability") {
    const capabilityStatus = evidence.capabilities[node.capability];
    if (capabilityStatus === undefined) return { status: "unknown" };
    if (capabilityStatus === "ok") return { status: "satisfied" };
    if (capabilityStatus === "unknown") return { status: "unknown" };
    if (capabilityStatus === "not-applicable")
      return { status: "not-applicable" };
    // "degraded" counts as unsatisfied for its requirement while still
    // rendering as amber rather than red on the capability tile.
    return { status: "unsatisfied" };
  }

  const probe = evidence.probes[requirementNodeId(node)];
  if (!probe) return { status: "unknown" };
  return { status: probe.ok ? "satisfied" : "unsatisfied", probe };
}

export function computeReadiness(
  evidence: ReadinessEvidence,
  profile: EnvironmentProfile | null,
  now: string,
): ReadinessReport {
  const items: ReadinessItem[] = [];

  for (const feature of FEATURE_REQUIREMENTS) {
    for (const entry of feature.requires) {
      const { node, severity, degradesToKey } = entry;
      const notApplicable = isNotApplicable(node, profile);
      const evaluated = notApplicable
        ? { status: "not-applicable" as RequirementStatus, probe: undefined }
        : statusFromEvidence(node, evidence);

      items.push({
        id: `${feature.featureId}:${requirementNodeId(node)}`,
        featureId: feature.featureId,
        featureNameKey: feature.nameKey,
        node,
        severity,
        status: evaluated.status,
        degradesToKey,
        evidence: evaluated.probe,
        remediation: evaluated.probe?.remediation,
      });
    }
  }

  const blocking = items.filter(
    (item) => item.severity === "blocking" && item.status === "unsatisfied",
  );
  const degrading = items.filter(
    (item) => item.severity === "degrading" && item.status === "unsatisfied",
  );
  const unknown = items.filter((item) => item.status === "unknown");

  // Weighted over everything that could count, so a report with many
  // satisfied optional items does not look better than it is. Not-applicable
  // items drop out of both numerator and denominator.
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    if (item.status === "not-applicable") continue;
    const weight = REQUIREMENT_WEIGHT[item.severity];
    if (weight === 0) continue;
    possible += weight;
    if (item.status === "satisfied") earned += weight;
  }

  const score = possible === 0 ? 100 : Math.round((earned / possible) * 100);

  return {
    score,
    blocking,
    degrading,
    unknown,
    byCapability: { ...evidence.capabilities },
    generatedAt: now,
  };
}

/** Features that cannot be used at all in the current state. */
export function blockedFeatureIds(report: ReadinessReport): string[] {
  return [...new Set(report.blocking.map((item) => item.featureId))];
}

/** Features that work but with something switched off or scope-limited. */
export function degradedFeatureIds(report: ReadinessReport): string[] {
  const blocked = new Set(blockedFeatureIds(report));
  return [
    ...new Set(
      report.degrading
        .map((item) => item.featureId)
        .filter((id) => !blocked.has(id)),
    ),
  ];
}
