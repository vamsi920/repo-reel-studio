import { clampTargetCount, normalizeProactiveConfig, sanitizeQualityMode } from "@/lib/proactiveConfig";
import type {
  ProactiveBatch,
  ProactiveBatchTransition,
  ProactiveCandidate,
  ProactiveCandidateStatus,
  ProactiveCandidateType,
  ProactiveExecutionFailure,
  ProactiveLinkedRunCommand,
  ProactiveLinkedRunSummary,
  ProactiveLinkedRunTimelineEvent,
  ProactiveReviewReadySummary,
  ProactiveStatus,
  ProactiveTimelineEvent,
} from "./proactiveAgentOps";

const KNOWN_CANDIDATE_STATUSES = new Set<string>([
  "observed",
  "discovering",
  "scoring",
  "patching",
  "validating",
  "discovered",
  "selected",
  "not_selected",
  "review_ready",
  "approved",
  "approved_internal",
  "dismissed",
  "executing",
  "needs_execution",
  "preparing",
  "workspace_ready",
  "cancelled",
  "timed_out",
  "no_patch",
  "execution_error",
]);

const KNOWN_CANDIDATE_TYPES = new Set<string>(["bug", "perf", "improvement", "reliability"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function asOptionalString(value: unknown): string | null {
  const text = asString(value, "").trim();
  return text || null;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(asString(value, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function unwrapProactiveErrorDetail(detail: unknown, depth = 0): unknown {
  if (depth > 6 || detail == null) return detail;
  if (typeof detail === "string" || Array.isArray(detail)) return detail;
  if (!isRecord(detail)) return detail;

  if (typeof detail.message === "string" && detail.message.trim()) {
    return detail;
  }

  if (detail.detail !== undefined && detail.detail !== detail) {
    const inner = unwrapProactiveErrorDetail(detail.detail, depth + 1);
    if (inner !== undefined && inner !== detail) return inner;
  }

  if (typeof detail.error === "string" && detail.error.trim()) {
    return detail.error;
  }

  if (isRecord(detail.error)) {
    return unwrapProactiveErrorDetail(detail.error, depth + 1);
  }

  return detail;
}

export function extractHttpErrorParts(payload: unknown): { detail: unknown; hint?: string } {
  if (!isRecord(payload)) {
    return { detail: payload };
  }

  const hint = asOptionalString(payload.hint) ?? undefined;
  let detail: unknown = payload.detail ?? payload.error ?? payload.message;

  if (typeof detail === "string" && !detail.trim() && payload.message) {
    detail = payload.message;
  }

  return { detail: unwrapProactiveErrorDetail(detail), hint };
}

export function normalizeCandidateStatus(value: unknown): ProactiveCandidateStatus {
  const status = asString(value, "discovered").trim() || "discovered";
  return (KNOWN_CANDIDATE_STATUSES.has(status) ? status : status) as ProactiveCandidateStatus;
}

export function normalizeCandidateType(value: unknown): ProactiveCandidateType {
  const kind = asString(value, "improvement").trim() || "improvement";
  return (KNOWN_CANDIDATE_TYPES.has(kind) ? kind : kind) as ProactiveCandidateType;
}

function normalizeBatchProgress(raw: unknown): ProactiveBatch["progress"] {
  const record = isRecord(raw) ? raw : {};
  return {
    discovered: asNumber(record.discovered, 0),
    selected: asNumber(record.selected, 0),
    materialized: asNumber(record.materialized, 0),
    ready: asNumber(record.ready, 0),
    dismissed: asNumber(record.dismissed, 0),
  };
}

export function normalizeProactiveBatch(raw: unknown): ProactiveBatch | null {
  if (raw == null) return null;
  if (!isRecord(raw)) return null;

  const transitions = Array.isArray(raw.transitions)
    ? raw.transitions
        .filter(isRecord)
        .map(
          (item): ProactiveBatchTransition => ({
            at: asString(item.at, ""),
            status: asString(item.status, ""),
            detail: asOptionalString(item.detail),
          }),
        )
    : [];

  return {
    id: asString(raw.id, ""),
    date: asString(raw.date, ""),
    status: asString(raw.status, ""),
    targetCount: asNumber(raw.targetCount, 6),
    repoHead: asOptionalString(raw.repoHead),
    dispatchStartedAt: asOptionalString(raw.dispatchStartedAt),
    dispatchCompletedAt: asOptionalString(raw.dispatchCompletedAt),
    transitions,
    progress: normalizeBatchProgress(raw.progress),
    metrics: {
      qualityMode: sanitizeQualityMode(isRecord(raw.metrics) ? raw.metrics.qualityMode : "high"),
      shortfallReason: isRecord(raw.metrics) ? asOptionalString(raw.metrics.shortfallReason) : null,
      averageScore: isRecord(raw.metrics) ? asNumber(raw.metrics.averageScore, 0) : 0,
    },
    createdAt: asOptionalString(raw.createdAt),
    updatedAt: asOptionalString(raw.updatedAt),
  };
}

function normalizeTimelineEvent(raw: unknown): ProactiveTimelineEvent | null {
  if (!isRecord(raw)) return null;
  return {
    at: asString(raw.at, ""),
    stage: asString(raw.stage, ""),
    title: asString(raw.title, ""),
    detail: asOptionalString(raw.detail),
    level: asString(raw.level, "info"),
    source: asOptionalString(raw.source) ?? undefined,
    model: asOptionalString(raw.model),
  };
}

function normalizeLinkedRunTimeline(raw: unknown): ProactiveLinkedRunTimelineEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((item) => ({
      id: asString(item.id, ""),
      at: asString(item.at, ""),
      kind: asString(item.kind, ""),
      title: asString(item.title, ""),
      detail: asString(item.detail, ""),
      level: (asString(item.level, "info") as "info" | "error" | "warning") || "info",
    }));
}

function normalizeLinkedRunTestMatrix(raw: unknown): ProactiveLinkedRunSummary["testMatrix"] {
  const record = isRecord(raw) ? raw : {};
  const suites = Array.isArray(record.suites)
    ? record.suites.filter(isRecord).map((suite) => ({
        suite: asString(suite.suite, "check"),
        command: asString(suite.command, ""),
        status: asString(suite.status, "failed"),
        durationMs: asNumber(suite.durationMs, 0),
        exitCode: asNumber(suite.exitCode, -1),
        failureSummary: asOptionalString(suite.failureSummary),
        impactedFiles: Array.isArray(suite.impactedFiles)
          ? suite.impactedFiles.map((path) => asString(path, "")).filter(Boolean)
          : [],
        logRef: asOptionalString(suite.logRef),
      }))
    : [];
  return {
    suites: suites.filter((suite) => suite.command),
    overallStatus: asString(record.overallStatus, "not_run"),
    totalDurationMs: asNumber(record.totalDurationMs, 0),
    passRate: asNumber(record.passRate, 0),
  };
}

function normalizeLinkedRunQualityGates(raw: unknown): ProactiveLinkedRunSummary["qualityGates"] {
  const record = isRecord(raw) ? raw : {};
  const recommendation = asString(record.recommendation, "review");
  return {
    recommendation,
    allPassed: asBoolean(record.allPassed, false),
    gates: Array.isArray(record.gates)
      ? record.gates.filter(isRecord).map((gate) => ({
          gate: asString(gate.gate, ""),
          status: asString(gate.status, "not_run"),
          detail: asOptionalString(gate.detail),
        }))
      : [],
  };
}

function normalizeLinkedRunCommands(raw: unknown): ProactiveLinkedRunCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((item) => ({
    command: asString(item.command, ""),
    exitCode: asNumber(item.exitCode, 0),
    stdout: asString(item.stdout, ""),
    stderr: asString(item.stderr, ""),
    durationMs: asNumber(item.durationMs, 0),
    kind: asOptionalString(item.kind) as ProactiveLinkedRunCommand["kind"],
  }));
}

export function normalizeProactiveLinkedRun(raw: unknown): ProactiveLinkedRunSummary | null {
  if (raw == null) return null;
  if (!isRecord(raw)) return null;

  const validation = isRecord(raw.validation) ? raw.validation : {};

  return {
    id: asString(raw.id, ""),
    status: asString(raw.status, ""),
    recoveryCode: asOptionalString(raw.recoveryCode),
    recoveryMessage: asOptionalString(raw.recoveryMessage),
    updatedAt: asOptionalString(raw.updatedAt),
    startedAt: asOptionalString(raw.startedAt),
    completedAt: asOptionalString(raw.completedAt),
    failureCategory: asOptionalString(raw.failureCategory),
    issueTitle: asOptionalString(raw.issueTitle),
    timeline: normalizeLinkedRunTimeline(raw.timeline),
    validation: {
      overallStatus: asString(validation.overallStatus, "not_run"),
      commands: normalizeLinkedRunCommands(validation.commands),
      notes: Array.isArray(validation.notes)
        ? validation.notes.map((note) => asString(note, "")).filter(Boolean)
        : [],
    },
    changedFiles: Array.isArray(raw.changedFiles)
      ? raw.changedFiles
          .filter(isRecord)
          .map((file) => ({
            path: asString(file.path, ""),
            additions: asNumber(file.additions, 0),
            deletions: asNumber(file.deletions, 0),
            changedLines: asNumber(
              file.changedLines,
              asNumber(file.additions, 0) + asNumber(file.deletions, 0),
            ),
            sensitive: asBoolean(file.sensitive, false),
          }))
          .filter((file) => file.path)
      : [],
    diffStat: asString(raw.diffStat, ""),
    hasPatch: asBoolean(raw.hasPatch, false),
    testMatrix: normalizeLinkedRunTestMatrix(raw.testMatrix),
    qualityGates: normalizeLinkedRunQualityGates(raw.qualityGates),
    changeIntent: {
      hypothesis: isRecord(raw.changeIntent) ? asOptionalString(raw.changeIntent.hypothesis) : null,
      evidenceSufficiency: isRecord(raw.changeIntent)
        ? asOptionalString(raw.changeIntent.evidenceSufficiency)
        : null,
    },
    evaluation: isRecord(raw.evaluation) ? raw.evaluation : {},
    policyViolations: Array.isArray(raw.policyViolations)
      ? raw.policyViolations.map((item) => asString(item, "")).filter(Boolean)
      : [],
    policyWarnings: Array.isArray(raw.policyWarnings)
      ? raw.policyWarnings.map((item) => asString(item, "")).filter(Boolean)
      : [],
    policyStatus: asString(raw.policyStatus, "clear"),
    policySummary: asString(raw.policySummary, ""),
    prApprovalBlocked: asBoolean(raw.prApprovalBlocked, false),
    prPromotionDiscouraged: asBoolean(raw.prPromotionDiscouraged, false),
    sensitivePaths: Array.isArray(raw.sensitivePaths)
      ? raw.sensitivePaths.map((item) => asString(item, "")).filter(Boolean)
      : [],
  };
}

function normalizeExecutionFailure(raw: unknown): ProactiveExecutionFailure | null {
  if (raw == null) return null;
  if (!isRecord(raw)) return null;
  const kind = asString(raw.kind, "no_patch");
  return {
    kind,
    label: asString(raw.label, ""),
    reason: asString(raw.reason, ""),
    retryInstructions: Array.isArray(raw.retryInstructions)
      ? raw.retryInstructions.map((item) => asString(item, "")).filter(Boolean)
      : [],
    isNoPatch: asBoolean(raw.isNoPatch, kind === "no_patch"),
    isBackendCrash: asBoolean(raw.isBackendCrash, false),
    executorSource: asOptionalString(raw.executorSource),
    policyStatus: asOptionalString(raw.policyStatus),
    policySummary: asOptionalString(raw.policySummary),
    policyViolations: Array.isArray(raw.policyViolations)
      ? raw.policyViolations.map((item) => asString(item, "")).filter(Boolean)
      : undefined,
    prApprovalBlocked: raw.prApprovalBlocked === undefined ? undefined : asBoolean(raw.prApprovalBlocked, false),
  };
}

function normalizeReviewReadySummary(raw: unknown): ProactiveReviewReadySummary | null {
  if (raw == null) return null;
  if (!isRecord(raw)) return null;
  return {
    validationCoverage: asOptionalString(raw.validationCoverage),
    validationSummary: asOptionalString(raw.validationSummary),
    qualityRecommendation: asOptionalString(raw.qualityRecommendation),
    requiresHumanApproval: asBoolean(raw.requiresHumanApproval, true),
    hasPatch: asBoolean(raw.hasPatch, false),
    eligible: raw.eligible === undefined ? undefined : asBoolean(raw.eligible, false),
    changedFileCount:
      raw.changedFileCount === undefined ? undefined : asNumber(raw.changedFileCount, 0),
    artifactPathCount:
      raw.artifactPathCount === undefined ? undefined : asNumber(raw.artifactPathCount, 0),
    policyStatus: asOptionalString(raw.policyStatus),
    policySummary: asOptionalString(raw.policySummary),
    policyViolations: Array.isArray(raw.policyViolations)
      ? raw.policyViolations.map((item) => asString(item, "")).filter(Boolean)
      : undefined,
    policyWarnings: Array.isArray(raw.policyWarnings)
      ? raw.policyWarnings.map((item) => asString(item, "")).filter(Boolean)
      : undefined,
    prApprovalBlocked: raw.prApprovalBlocked === undefined ? undefined : asBoolean(raw.prApprovalBlocked, false),
    prPromotionDiscouraged:
      raw.prPromotionDiscouraged === undefined ? undefined : asBoolean(raw.prPromotionDiscouraged, false),
  };
}

function normalizeCandidateScore(raw: unknown): ProactiveCandidate["score"] {
  const record = isRecord(raw) ? raw : {};
  return {
    signal: asNumber(record.signal, 0),
    validation: asNumber(record.validation, 0),
    centrality: asNumber(record.centrality, 0),
    risk: asNumber(record.risk, 0),
    total: asNumber(record.total, 0),
  };
}

export function normalizeProactiveCandidate(raw: unknown): ProactiveCandidate {
  const record = isRecord(raw) ? raw : {};
  const status = normalizeCandidateStatus(record.status);
  const timeline = Array.isArray(record.timeline)
    ? record.timeline.map(normalizeTimelineEvent).filter((item): item is ProactiveTimelineEvent => item !== null)
    : [];

  return {
    id: asString(record.id, ""),
    batchId: asString(record.batchId, ""),
    repoUrl: asString(record.repoUrl, ""),
    projectId: asOptionalString(record.projectId),
    status,
    type: normalizeCandidateType(record.type),
    title: asString(record.title, ""),
    hypothesis: asString(record.hypothesis, ""),
    evidence: Array.isArray(record.evidence)
      ? record.evidence.map((item) => asString(item, "")).filter(Boolean)
      : [],
    score: normalizeCandidateScore(record.score),
    dedupeKey: asString(record.dedupeKey, ""),
    selectedReason: asOptionalString(record.selectedReason),
    notSelectedReason: asOptionalString(record.notSelectedReason),
    runId: asOptionalString(record.runId),
    stage: asOptionalString(record.stage),
    timeline,
    reviewReady: asBoolean(record.reviewReady, status === "review_ready"),
    reviewMetadata: isRecord(record.reviewMetadata) ? record.reviewMetadata : undefined,
    executionFailure: normalizeExecutionFailure(record.executionFailure),
    reviewReadySummary: normalizeReviewReadySummary(record.reviewReadySummary),
    qualityGates: isRecord(record.qualityGates) ? record.qualityGates : undefined,
    policyStatus: asOptionalString(record.policyStatus) ?? "clear",
    policySummary: asOptionalString(record.policySummary),
    policyViolations: Array.isArray(record.policyViolations)
      ? record.policyViolations.map((item) => asString(item, "")).filter(Boolean)
      : [],
    policyWarnings: Array.isArray(record.policyWarnings)
      ? record.policyWarnings.map((item) => asString(item, "")).filter(Boolean)
      : [],
    prApprovalBlocked: asBoolean(record.prApprovalBlocked, false),
    prPromotionDiscouraged: asBoolean(record.prPromotionDiscouraged, false),
    linkedRun: normalizeProactiveLinkedRun(record.linkedRun),
    recovery: isRecord(record.recovery)
      ? {
          linkedRun: asOptionalString(record.recovery.linkedRun),
          enrichment: asOptionalString(record.recovery.enrichment),
          message: asOptionalString(record.recovery.message),
        }
      : undefined,
    createdAt: asString(record.createdAt, ""),
    updatedAt: asString(record.updatedAt, ""),
  };
}

export function normalizeProactiveStatus(raw: unknown): ProactiveStatus {
  const record = isRecord(raw) ? raw : {};
  const configSource = isRecord(record.config) ? record.config : record;
  const config = normalizeProactiveConfig({
    repoUrl: asString(configSource.repoUrl, ""),
    projectId: asOptionalString(configSource.projectId),
    enabled: configSource.enabled,
    targetCount: configSource.targetCount,
    qualityMode: configSource.qualityMode,
    timezone: configSource.timezone,
    morningDeadline: configSource.morningDeadline,
    updatedAt: configSource.updatedAt,
  }) as ProactiveStatus["config"];

  let target = config.targetCount;
  if (record.target !== undefined && record.target !== null) {
    try {
      target = clampTargetCount(record.target, "target");
    } catch {
      target = config.targetCount;
    }
  }

  const batch = normalizeProactiveBatch(record.batch);
  const candidates = Array.isArray(record.candidates)
    ? record.candidates.map(normalizeProactiveCandidate)
    : [];

  const readyFromPayload = record.ready;
  const ready =
    readyFromPayload !== undefined && readyFromPayload !== null
      ? asNumber(readyFromPayload, batch?.progress.ready ?? 0)
      : (batch?.progress.ready ??
        candidates.filter((item) => item.status === "review_ready").length);

  const storeRecovery = isRecord(record.storeRecovery)
    ? {
        degraded: asBoolean(record.storeRecovery.degraded, false),
        quarantinedRecords: asNumber(record.storeRecovery.quarantinedRecords, 0),
        messages: Array.isArray(record.storeRecovery.messages)
          ? record.storeRecovery.messages.map((item) => asString(item, "")).filter(Boolean)
          : [],
      }
    : undefined;

  return {
    config,
    batch,
    ready,
    target,
    candidates,
    shortfallReason: asOptionalString(record.shortfallReason),
    storeRecovery,
  };
}
