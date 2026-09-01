import { I18nKey } from "#/i18n/declaration";
import type { Capability, ConnectorMaturity } from "./types/capability";
import type { ConnectionStatus, ProbeVantage } from "./types/probe";
import type {
  CapabilityStatus,
  RequirementSeverity,
  RequirementStatus,
} from "./types/requirements";
import type { DeploymentMode } from "./types/profile";
import type { DiscoverySection } from "#/constants/onboarding-control";

export const CAPABILITY_LABEL_KEY: Record<Capability, I18nKey> = {
  "source-control": I18nKey.ENVIRONMENT$CAPABILITY_SOURCE_CONTROL,
  "issue-tracker": I18nKey.ENVIRONMENT$CAPABILITY_ISSUE_TRACKER,
  llm: I18nKey.ENVIRONMENT$CAPABILITY_LLM,
  "vector-store": I18nKey.ENVIRONMENT$CAPABILITY_VECTOR_STORE,
  "object-storage": I18nKey.ENVIRONMENT$CAPABILITY_OBJECT_STORAGE,
  "relational-db": I18nKey.ENVIRONMENT$CAPABILITY_RELATIONAL_DB,
  secrets: I18nKey.ENVIRONMENT$CAPABILITY_SECRETS,
  observability: I18nKey.ENVIRONMENT$CAPABILITY_OBSERVABILITY,
  notifications: I18nKey.ENVIRONMENT$CAPABILITY_NOTIFICATIONS,
  ci: I18nKey.ENVIRONMENT$CAPABILITY_CI,
  identity: I18nKey.ENVIRONMENT$CAPABILITY_IDENTITY,
};

export const CAPABILITY_STATUS_LABEL_KEY: Record<CapabilityStatus, I18nKey> = {
  ok: I18nKey.ENVIRONMENT$STATUS_OK,
  degraded: I18nKey.ENVIRONMENT$STATUS_DEGRADED,
  missing: I18nKey.ENVIRONMENT$STATUS_MISSING,
  unknown: I18nKey.ENVIRONMENT$STATUS_UNKNOWN,
  "not-applicable": I18nKey.ENVIRONMENT$STATUS_NOT_APPLICABLE,
};

export const CONNECTION_STATUS_LABEL_KEY: Record<ConnectionStatus, I18nKey> = {
  unverified: I18nKey.ENVIRONMENT$STATUS_UNKNOWN,
  ok: I18nKey.ENVIRONMENT$STATUS_OK,
  degraded: I18nKey.ENVIRONMENT$STATUS_DEGRADED,
  error: I18nKey.ENVIRONMENT$STATUS_ERROR,
  expired: I18nKey.ENVIRONMENT$STATUS_EXPIRED,
  revoked: I18nKey.ENVIRONMENT$STATUS_REVOKED,
};

export const MATURITY_LABEL_KEY: Record<ConnectorMaturity, I18nKey> = {
  ga: I18nKey.ENVIRONMENT$MATURITY_GA,
  beta: I18nKey.ENVIRONMENT$MATURITY_BETA,
  experimental: I18nKey.ENVIRONMENT$MATURITY_EXPERIMENTAL,
};

export const VANTAGE_LABEL_KEY: Record<ProbeVantage, I18nKey> = {
  browser: I18nKey.ENVIRONMENT$VANTAGE_BROWSER,
  edge: I18nKey.ENVIRONMENT$VANTAGE_EDGE,
  runtime: I18nKey.ENVIRONMENT$VANTAGE_RUNTIME,
};

export const SEVERITY_LABEL_KEY: Record<RequirementSeverity, I18nKey> = {
  blocking: I18nKey.ENVIRONMENT$SEVERITY_BLOCKING,
  degrading: I18nKey.ENVIRONMENT$SEVERITY_DEGRADING,
  optional: I18nKey.ENVIRONMENT$SEVERITY_OPTIONAL,
};

export const DEPLOYMENT_MODE_LABEL_KEY: Record<DeploymentMode, I18nKey> = {
  saas: I18nKey.ENVIRONMENT$MODE_SAAS,
  hybrid: I18nKey.ENVIRONMENT$MODE_HYBRID,
  "self-hosted": I18nKey.ENVIRONMENT$MODE_SELF_HOSTED,
  "air-gapped": I18nKey.ENVIRONMENT$MODE_AIR_GAPPED,
};

export const DEPLOYMENT_MODE_DESC_KEY: Record<DeploymentMode, I18nKey> = {
  saas: I18nKey.ENVIRONMENT$MODE_SAAS_DESC,
  hybrid: I18nKey.ENVIRONMENT$MODE_HYBRID_DESC,
  "self-hosted": I18nKey.ENVIRONMENT$MODE_SELF_HOSTED_DESC,
  "air-gapped": I18nKey.ENVIRONMENT$MODE_AIR_GAPPED_DESC,
};

/**
 * Maps a status onto the shared `.ame-pip` classes from
 * `src/styles/neo-design-system.css`, so a connection dot here looks the same
 * as one anywhere else in the app.
 *
 * "Not checked" gets the neutral pip rather than a warning colour on purpose:
 * an unprobed requirement is an absence of evidence, and colouring it amber
 * teaches people to ignore amber.
 */
export function pipClassForCapabilityStatus(status: CapabilityStatus): string {
  switch (status) {
    case "ok":
      return "ame-pip ame-pip-success";
    case "degraded":
      return "ame-pip ame-pip-warning";
    case "missing":
      return "ame-pip ame-pip-error";
    default:
      return "ame-pip";
  }
}

export function pipClassForRequirementStatus(
  status: RequirementStatus,
): string {
  switch (status) {
    case "satisfied":
      return "ame-pip ame-pip-success";
    case "unsatisfied":
      return "ame-pip ame-pip-error";
    default:
      return "ame-pip";
  }
}

export function readinessHeadlineKey(
  score: number,
  blockingCount: number,
): I18nKey {
  if (blockingCount > 0) return I18nKey.ENVIRONMENT$READINESS_BLOCKED;
  if (score >= 100) return I18nKey.ENVIRONMENT$READINESS_READY;
  return I18nKey.ENVIRONMENT$READINESS_PARTIAL;
}

/** Accent for the readiness ring; red only when something actually blocks. */
export function readinessAccent(score: number, blockingCount: number): string {
  if (blockingCount > 0) return "var(--error-500)";
  if (score >= 100) return "var(--success-500)";
  return "var(--warning-500)";
}

export const DISCOVERY_SECTION_LABEL_KEY: Record<DiscoverySection, I18nKey> = {
  org: I18nKey.ENVIRONMENT$SECTION_ORG,
  stack: I18nKey.ENVIRONMENT$SECTION_STACK,
  delivery: I18nKey.ENVIRONMENT$SECTION_DELIVERY,
  team: I18nKey.ENVIRONMENT$SECTION_TEAM,
  constraints: I18nKey.ENVIRONMENT$SECTION_CONSTRAINTS,
  conventions: I18nKey.ENVIRONMENT$SECTION_CONVENTIONS,
};
