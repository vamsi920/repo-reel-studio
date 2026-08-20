/**
 * Security data model — types only.
 *
 * This shard establishes where Security lives in the product and what its data
 * will look like. There is deliberately no scanning engine behind it: no
 * scanner is integrated, no findings are produced, and nothing here is
 * persisted. The real engine is designed separately; when it lands it should
 * be able to adopt these shapes without changing any call site that already
 * imports them.
 */

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

/** Ordered worst-first, so UI never has to hardcode a severity ordering. */
export const SECURITY_SEVERITIES: readonly SecuritySeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

export type SecurityScanStatus =
  | "not_configured"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * The categories Security will eventually cover. These double as the page's
 * future-area sections, so the page and the model cannot drift apart.
 */
export type SecurityCategory =
  | "repository"
  | "dependencies"
  | "secrets"
  | "misconfiguration"
  | "risk"
  | "remediation";

/**
 * Which tool produced a finding. Left as a plain string: no scanner is chosen
 * or integrated by this shard, and pinning an enum here would prejudge that
 * decision.
 */
export type SecurityScannerId = string;

export interface SecurityLineRange {
  start: number;
  /** Omitted for a single-line finding. */
  end?: number;
}

/** Why a finding is believed to be real — never a fabricated snippet. */
export interface SecurityEvidence {
  kind: "code" | "dependency" | "config" | "runtime" | "reference";
  summary: string;
  snippet?: string;
  filePath?: string;
  lineRange?: SecurityLineRange;
  /** External references (advisory ids, CVEs, docs). */
  references?: string[];
}

export type SecurityRemediationKind =
  | "upgrade"
  | "patch"
  | "config_change"
  | "rotate_secret"
  | "manual";

export interface SecurityRemediation {
  kind: SecurityRemediationKind;
  summary: string;
  /** A suggested change, when one can be derived. Never invented. */
  diff?: string;
  /** Set once an agent-driven fix exists; unused by this shard. */
  agentTaskId?: string;
}

export type SecurityFindingStatus =
  | "open"
  | "triaged"
  | "in_progress"
  | "fixed"
  | "accepted_risk"
  | "false_positive";

export type SecurityVerificationStatus =
  | "unverified"
  | "verifying"
  | "verified"
  | "verification_failed";

export interface SecurityFinding {
  id: string;
  workspaceId: string;
  repositoryId: string;
  commitSha: string;
  scanner: SecurityScannerId;
  category: SecurityCategory;
  severity: SecuritySeverity;
  title: string;
  description: string;
  filePath?: string;
  lineRange?: SecurityLineRange;
  evidence: SecurityEvidence[];
  /** 0-100. Only ever computed from a real scan. */
  riskScore: number;
  status: SecurityFindingStatus;
  remediation?: SecurityRemediation;
  verificationStatus: SecurityVerificationStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface SecurityScan {
  id: string;
  workspaceId: string;
  repositoryId: string;
  commitSha: string;
  status: SecurityScanStatus;
  scanners: SecurityScannerId[];
  startedAt?: string;
  completedAt?: string;
  /** Populated only by a real scan; absent means "not scanned", not "clean". */
  findingIds?: string[];
  error?: string;
}

/** Counts by severity. Absent (not zeroed) when no scan has ever run. */
export type SecuritySeverityCounts = Record<SecuritySeverity, number>;

export interface SecuritySummary {
  workspaceId: string;
  status: SecurityScanStatus;
  lastScan?: SecurityScan;
  counts?: SecuritySeverityCounts;
  /** 0-100, worst-first weighted. Absent until a real scan produces one. */
  overallRiskScore?: number;
}

/**
 * The read surface the future engine will implement. Nothing implements it
 * yet — the page renders its empty state from the absence of a provider.
 */
export interface SecurityProvider {
  getSummary(workspaceId: string): Promise<SecuritySummary>;
  listFindings(workspaceId: string): Promise<SecurityFinding[]>;
  listScans(workspaceId: string): Promise<SecurityScan[]>;
}
