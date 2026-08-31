import type { Capability } from "./capability";
import type { ProbeResult, Remediation } from "./probe";

/** Where an environment variable is set. */
export type EnvScope = "netlify" | "fly" | "supabase-edge";

export interface RequirementEnvRef {
  scope: EnvScope;
  name: string;
}

export type RequirementNode =
  | { kind: "capability"; capability: Capability; anyOf?: string[] }
  | { kind: "env"; scope: EnvScope; name: string; expected?: string }
  /**
   * Two variables in different places that must hold the same value. Nothing
   * syncs them, and the failure is invisible to a liveness check -- see the
   * `session-key-drift` pair, where `/health` returns 200 while every
   * authenticated call 401s.
   */
  | { kind: "env-pair"; id: string }
  | { kind: "pg-extension"; name: string; minVersion?: string }
  | { kind: "host-binary"; name: string; minVersion?: string }
  | { kind: "egress"; host: string; port: number }
  /** Something outside must be able to reach us -- a webhook receiver. */
  | { kind: "inbound"; path: string }
  | { kind: "storage-bucket"; name: string; public?: boolean }
  /** A known defect in the deployment itself, not a missing dependency. */
  | { kind: "deployment-defect"; id: string };

export type RequirementSeverity = "blocking" | "degrading" | "optional";

export interface FeatureRequirement {
  featureId: string;
  nameKey: string;
  requires: {
    node: RequirementNode;
    severity: RequirementSeverity;
    /** What the user loses when a `degrading` node is unsatisfied. */
    degradesToKey?: string;
  }[];
}

export type RequirementStatus =
  | "satisfied"
  | "unsatisfied"
  /** Nothing has proved it either way. Never rendered as a failure. */
  | "unknown"
  /** Excluded by the deployment mode or policy (e.g. telemetry, air-gapped). */
  | "not-applicable";

export interface ReadinessItem {
  /** Stable id derived from the node; used as a task key and a React key. */
  id: string;
  featureId: string;
  featureNameKey: string;
  node: RequirementNode;
  severity: RequirementSeverity;
  status: RequirementStatus;
  degradesToKey?: string;
  evidence?: ProbeResult;
  remediation?: Remediation;
}

export type CapabilityStatus =
  | "ok"
  /** Connected and reachable, but scope-limited or partially failing. */
  | "degraded"
  | "missing"
  | "unknown"
  | "not-applicable";

export interface ReadinessReport {
  /**
   * 0-100. Blocking items weigh 3x a degrading one; optional items do not
   * count. `unknown` counts as unsatisfied for the score but is reported
   * separately so the UI never presents "we did not check" as "broken".
   */
  score: number;
  blocking: ReadinessItem[];
  degrading: ReadinessItem[];
  unknown: ReadinessItem[];
  byCapability: Partial<Record<Capability, CapabilityStatus>>;
  generatedAt: string;
}

export const REQUIREMENT_WEIGHT: Record<RequirementSeverity, number> = {
  blocking: 3,
  degrading: 1,
  optional: 0,
};
