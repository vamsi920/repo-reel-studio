import { resolveApiPath } from "@/lib/apiPath";
import { parseAgentOpsAttention, sanitizeAgentOpsRaw, stripAgentOpsMarkup } from "@/lib/agentOpsAttention";
import { serializeProactiveContextHints } from "@/lib/proactiveContextHints";
import {
  clampTargetCount,
  normalizeProactiveConfig,
  PROACTIVE_TARGET_COUNT_MAX,
  validateProactiveConfigPatch,
  type ProactiveConfigPatchInput,
} from "@/lib/proactiveConfig";

export {
  clampTargetCount,
  coerceMorningDeadline,
  MORNING_DEADLINE_PATTERN,
  normalizeProactiveConfig,
  PROACTIVE_TARGET_COUNT_MAX,
  PROACTIVE_TARGET_COUNT_MIN,
  ProactiveConfigValidationError,
  sanitizeTimezone,
  validateMorningDeadline,
  validateProactiveConfigPatch,
} from "@/lib/proactiveConfig";

export type ProactiveApiErrorDetail = {
  message?: string;
  code?: string;
  field?: string;
  hint?: string;
  errors?: Array<{ field?: string | null; message?: string; type?: string }>;
};

export function normalizeErrorText(value: string): string {
  if (!value) return value;
  const stripped = stripAgentOpsMarkup(value);
  const attention = parseAgentOpsAttention(stripped, "proactive");
  if (attention) return attention.message;
  return sanitizeAgentOpsRaw(stripped);
}

export {
  extractHttpErrorParts,
  isRecord,
  normalizeProactiveBatch,
  normalizeProactiveCandidate,
  normalizeProactiveLinkedRun,
  normalizeProactiveStatus,
  unwrapProactiveErrorDetail,
} from "@/lib/proactiveNormalize";

import {
  extractHttpErrorParts,
  normalizeProactiveBatch,
  normalizeProactiveCandidate,
  normalizeProactiveStatus,
  unwrapProactiveErrorDetail,
} from "@/lib/proactiveNormalize";

export function formatProactiveApiErrorDetail(detail: unknown, statusCode?: number): string {
  const resolved = unwrapProactiveErrorDetail(detail);
  if (typeof resolved === "string" && resolved.trim()) {
    return normalizeErrorText(resolved);
  }
  if (Array.isArray(resolved)) {
    const parts = resolved
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(row.loc)
          ? row.loc.filter((part) => part !== "body").join(".")
          : "";
        const msg = typeof row.msg === "string" ? row.msg : "Invalid value";
        return field ? `${field}: ${msg}` : msg;
      })
      .filter(Boolean);
    return normalizeErrorText(parts.join("; ") || "Request validation failed");
  }
  if (resolved && typeof resolved === "object") {
    const structured = resolved as ProactiveApiErrorDetail;
    const message =
      typeof structured.message === "string" && structured.message.trim()
        ? structured.message.trim()
        : "";
    if (message) {
      const hint =
        typeof structured.hint === "string" && structured.hint.trim() ? structured.hint.trim() : "";
      const field =
        typeof structured.field === "string" && structured.field.trim()
          ? `${structured.field}: `
          : "";
      const code =
        typeof structured.code === "string" && structured.code.trim()
          ? ` (${structured.code})`
          : "";
      const base = normalizeErrorText(`${field}${message}${code}`);
      return hint ? `${base}\n${normalizeErrorText(hint)}` : base;
    }
  }
  if (statusCode) {
    return `Request failed with status ${statusCode}`;
  }
  return normalizeErrorText(JSON.stringify(resolved));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  const raw = await response.text();
  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { detail: normalizeErrorText(raw) };
  }
  if (!response.ok) {
    const { detail, hint } = extractHttpErrorParts(payload);
    const msg = formatProactiveApiErrorDetail(detail, response.status);
    throw new Error(hint ? `${msg}\n${normalizeErrorText(hint)}` : msg);
  }
  return payload as T;
}

export type ProactiveCandidateType = "bug" | "perf" | "improvement" | "reliability" | string;
export type ProactiveCandidateStatus =
  | "observed"
  | "discovering"
  | "scoring"
  | "patching"
  | "validating"
  | "discovered"
  | "selected"
  | "not_selected"
  | "review_ready"
  | "approved"
  | "approved_internal"
  | "executing"
  | "needs_execution"
  | "preparing"
  | "workspace_ready"
  | "dismissed"
  | string;

export interface ProactiveConfig {
  repoUrl: string;
  projectId?: string | null;
  enabled: boolean;
  targetCount: number;
  qualityMode: "high" | string;
  timezone: string;
  morningDeadline: string;
  updatedAt: string;
}

export type ProactiveDispatchStatus = "complete" | "skipped" | "in_progress" | "unchanged" | string;

export interface ProactiveBatchTransition {
  at: string;
  status: string;
  detail?: string | null;
}

export interface ProactiveBatch {
  id: string;
  date: string;
  status: string;
  targetCount: number;
  repoHead?: string | null;
  dispatchStartedAt?: string | null;
  dispatchCompletedAt?: string | null;
  transitions?: ProactiveBatchTransition[];
  progress: {
    discovered: number;
    selected: number;
    materialized: number;
    ready: number;
    dismissed: number;
  };
  metrics: {
    qualityMode: string;
    shortfallReason?: string | null;
    averageScore: number;
  };
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProactiveTimelineEvent {
  at: string;
  stage: string;
  title: string;
  detail?: string | null;
  level?: "info" | "warning" | "error" | string;
  source?: "ai" | string;
  model?: string | null;
}

export interface ProactiveLinkedRunTimelineEvent {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string;
  level: "info" | "error" | "warning";
}

export interface ProactiveLinkedRunCommand {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  kind?: "install" | "validation";
}

export interface ProactiveLinkedRunTestMatrixEntry {
  suite: string;
  command: string;
  status: "passed" | "failed" | "skipped" | "timeout" | string;
  durationMs: number;
  exitCode: number;
  failureSummary?: string | null;
  impactedFiles: string[];
  logRef?: string | null;
}

export interface ProactiveLinkedRunTestMatrix {
  suites: ProactiveLinkedRunTestMatrixEntry[];
  overallStatus: "passed" | "partial" | "failed" | "not_run" | string;
  totalDurationMs: number;
  passRate: number;
}

export interface ProactiveLinkedRunQualityGates {
  recommendation: "ship" | "review" | "rework" | string;
  allPassed: boolean;
  gates: Array<{ gate: string; status: string; detail?: string | null }>;
}

export interface ProactiveReviewReadySummary {
  validationCoverage?: "full" | "partial" | "missing" | string | null;
  validationSummary?: string | null;
  qualityRecommendation?: string | null;
  requiresHumanApproval?: boolean;
  hasPatch?: boolean;
  eligible?: boolean;
  changedFileCount?: number;
  artifactPathCount?: number;
  policyStatus?: "clear" | "warning" | "blocked" | string | null;
  policySummary?: string | null;
  policyViolations?: string[];
  policyWarnings?: string[];
  prApprovalBlocked?: boolean;
  prPromotionDiscouraged?: boolean;
}

export interface ProactiveExecutionFailure {
  kind: "no_patch" | "execution_error" | string;
  label: string;
  reason: string;
  retryInstructions: string[];
  isNoPatch: boolean;
  isBackendCrash: boolean;
  executorSource?: string | null;
  policyStatus?: "clear" | "warning" | "blocked" | string | null;
  policySummary?: string | null;
  policyViolations?: string[];
  prApprovalBlocked?: boolean;
}

export interface ProactiveDeepWorkStage {
  key: string;
  label: string;
  status: "done" | "failed" | "skipped" | "pending" | string;
  detail: string;
}

export interface ProactiveDeepWorkApproach {
  id: string;
  title: string;
  risk: string;
  score: number | null;
  rationale: string;
}

export interface ProactiveDeepWorkAttempt {
  index: number | null;
  validationStatus: string;
  patchPresent: boolean;
  changedFiles: number | null;
  approachTitle: string;
  prReady: boolean;
}

export interface ProactiveDeepWorkJourney {
  version: number;
  prReady: boolean;
  stages: ProactiveDeepWorkStage[];
  approaches: ProactiveDeepWorkApproach[];
  attempts: ProactiveDeepWorkAttempt[];
  attemptsRun: number;
  maxAttempts: number | null;
  selected: { id?: string; title?: string } | null;
  research: {
    summary: string;
    targetFile: string;
    relatedFiles: string[];
    existingTests: string[];
    riskNotes: string[];
  };
}

export interface ProactiveLinkedRunSummary {
  id: string;
  status: string;
  recoveryCode?: string | null;
  recoveryMessage?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failureCategory?: string | null;
  issueTitle?: string | null;
  timeline: ProactiveLinkedRunTimelineEvent[];
  validation: {
    overallStatus: "passed" | "partial" | "failed" | "not_run" | string;
    commands: ProactiveLinkedRunCommand[];
    notes: string[];
  };
  changedFiles: Array<{
    path: string;
    additions: number;
    deletions: number;
    changedLines: number;
    sensitive: boolean;
  }>;
  diffStat: string;
  hasPatch: boolean;
  testMatrix: ProactiveLinkedRunTestMatrix;
  qualityGates: ProactiveLinkedRunQualityGates;
  changeIntent: {
    hypothesis: string | null;
    evidenceSufficiency: "strong" | "moderate" | "weak" | string | null;
  };
  evaluation: Record<string, unknown>;
  policyViolations: string[];
  policyWarnings: string[];
  policyStatus: "clear" | "warning" | "blocked" | string;
  policySummary: string;
  prApprovalBlocked: boolean;
  prPromotionDiscouraged: boolean;
  sensitivePaths: string[];
  prReady?: boolean;
  journey?: ProactiveDeepWorkJourney | null;
}

export interface ProactiveCandidate {
  id: string;
  batchId: string;
  repoUrl: string;
  projectId?: string | null;
  status: ProactiveCandidateStatus;
  type: ProactiveCandidateType;
  title: string;
  hypothesis: string;
  evidence: string[];
  score: {
    signal: number;
    validation: number;
    centrality: number;
    risk: number;
    total: number;
  };
  dedupeKey: string;
  selectedReason?: string | null;
  notSelectedReason?: string | null;
  runId?: string | null;
  stage?: string | null;
  timeline?: ProactiveTimelineEvent[];
  reviewReady?: boolean;
  reviewMetadata?: Record<string, unknown>;
  executionFailure?: ProactiveExecutionFailure | null;
  reviewReadySummary?: ProactiveReviewReadySummary | null;
  qualityGates?: Record<string, unknown>;
  policyStatus?: "clear" | "warning" | "blocked" | string | null;
  policySummary?: string | null;
  policyViolations?: string[];
  policyWarnings?: string[];
  prApprovalBlocked?: boolean;
  prPromotionDiscouraged?: boolean;
  linkedRun?: ProactiveLinkedRunSummary | null;
  recovery?: { linkedRun?: string; enrichment?: string; message?: string };
  createdAt: string;
  updatedAt: string;
}

export interface ProactiveStoreRecovery {
  degraded: boolean;
  quarantinedRecords: number;
  messages: string[];
}

export interface ProactiveStatus {
  config: ProactiveConfig;
  batch?: ProactiveBatch | null;
  ready: number;
  target: number;
  candidates: ProactiveCandidate[];
  shortfallReason?: string | null;
  storeRecovery?: ProactiveStoreRecovery;
}

export interface ProactiveDispatchResult extends ProactiveStatus {
  dispatchStatus?: ProactiveDispatchStatus;
  dispatchReason?: string | null;
}

export async function getProactiveConfig(params: {
  repoUrl: string;
  projectId?: string | null;
}): Promise<ProactiveConfig> {
  const search = new URLSearchParams({ repoUrl: params.repoUrl });
  if (params.projectId) search.set("projectId", params.projectId);
  const payload = await requestJson<{ config: ProactiveConfig }>(`/proactive/config?${search}`);
  return normalizeProactiveConfig(payload.config) as ProactiveConfig;
}

export async function updateProactiveConfig(input: Partial<ProactiveConfig> & {
  repoUrl: string;
  projectId?: string | null;
}): Promise<ProactiveConfig> {
  const patchInput: ProactiveConfigPatchInput = {};
  if (input.enabled !== undefined) patchInput.enabled = input.enabled;
  if (input.targetCount !== undefined) patchInput.targetCount = input.targetCount;
  if (input.qualityMode !== undefined) patchInput.qualityMode = input.qualityMode;
  if (input.timezone !== undefined) patchInput.timezone = input.timezone;
  if (input.morningDeadline !== undefined) patchInput.morningDeadline = input.morningDeadline;

  const patch = validateProactiveConfigPatch(patchInput);
  const payload = await requestJson<{ config: ProactiveConfig }>("/proactive/config", {
    method: "POST",
    body: JSON.stringify({
      repoUrl: input.repoUrl,
      projectId: input.projectId ?? null,
      ...patch,
    }),
  });
  return normalizeProactiveConfig(payload.config) as ProactiveConfig;
}

export async function getProactiveStatus(params: {
  repoUrl: string;
  projectId?: string | null;
}): Promise<ProactiveStatus> {
  const search = new URLSearchParams({ repoUrl: params.repoUrl });
  if (params.projectId) search.set("projectId", params.projectId);
  const payload = await requestJson<unknown>(`/proactive/status?${search}`);
  return normalizeProactiveStatus(payload);
}

export async function listProactiveCandidates(params: {
  repoUrl: string;
  projectId?: string | null;
  batchId?: string | null;
  includeDismissed?: boolean;
}): Promise<ProactiveCandidate[]> {
  const search = new URLSearchParams({ repoUrl: params.repoUrl });
  if (params.projectId) search.set("projectId", params.projectId);
  if (params.batchId) search.set("batchId", params.batchId);
  if (params.includeDismissed) search.set("includeDismissed", "true");
  const payload = await requestJson<{ candidates?: unknown[] }>(`/proactive/candidates?${search}`);
  return Array.isArray(payload.candidates)
    ? payload.candidates.map(normalizeProactiveCandidate)
    : [];
}

export async function getProactiveCandidate(candidateId: string): Promise<ProactiveCandidate> {
  const payload = await requestJson<{ candidate?: unknown }>(`/proactive/candidates/${candidateId}`);
  return normalizeProactiveCandidate(payload.candidate);
}

export async function dispatchProactiveDaily(input: {
  repoUrl: string;
  repoName?: string | null;
  projectId?: string | null;
  contextHints?: Record<string, unknown> | null;
  targetCount?: number;
  githubToken?: string | null;
}): Promise<ProactiveDispatchResult> {
  const body: Record<string, unknown> = {
    repoUrl: input.repoUrl,
    repoName: input.repoName ?? null,
    projectId: input.projectId ?? null,
    contextHints: input.contextHints ? serializeProactiveContextHints(input.contextHints) : null,
  };
  const githubToken = typeof input.githubToken === "string" ? input.githubToken.trim() : "";
  if (githubToken) {
    body.githubToken = githubToken;
  }
  if (input.targetCount !== undefined && input.targetCount !== null) {
    body.targetCount = clampTargetCount(input.targetCount);
  }
  const payload = await requestJson<Record<string, unknown>>("/proactive/dispatch-daily", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const status = normalizeProactiveStatus(payload);
  return {
    ...status,
    dispatchStatus: typeof payload.status === "string" ? payload.status : undefined,
    dispatchReason: typeof payload.reason === "string" ? payload.reason : null,
  };
}

export async function approveProactiveCandidate(
  candidateId: string,
  branchName?: string,
): Promise<{
  candidate: ProactiveCandidate;
  run?: unknown;
  approvalOutcome?: "promote_pr" | "approved_internal" | string;
  detail?: string;
}> {
  const payload = await requestJson<{
    candidate?: unknown;
    run?: unknown;
    approvalOutcome?: string;
    detail?: string;
  }>(`/proactive/candidates/${candidateId}/approve`, {
    method: "POST",
    body: JSON.stringify({ branchName }),
  });
  return {
    ...payload,
    candidate: normalizeProactiveCandidate(payload.candidate),
  };
}

export interface ProactiveDismissResult {
  candidate: ProactiveCandidate;
  batch?: ProactiveBatch | null;
}

export function computeProactiveReadyCount(candidates: ProactiveCandidate[]): number {
  return candidates.filter((item) => item.status === "review_ready").length;
}

export function applyProactiveCandidatePatch(
  status: ProactiveStatus,
  candidate: ProactiveCandidate,
  options?: { removeFromList?: boolean; batch?: ProactiveBatch | null },
): ProactiveStatus {
  const removeFromList = options?.removeFromList ?? candidate.status === "dismissed";
  const candidates = removeFromList
    ? status.candidates.filter((item) => item.id !== candidate.id)
    : status.candidates.map((item) => (item.id === candidate.id ? candidate : item));

  const batch = options?.batch ?? status.batch;
  const ready =
    batch?.progress?.ready !== undefined && batch?.progress?.ready !== null
      ? batch.progress.ready
      : computeProactiveReadyCount(candidates);

  return {
    ...status,
    candidates,
    batch: batch ?? status.batch,
    ready,
  };
}

export async function dismissProactiveCandidate(
  candidateId: string,
  reason?: string,
): Promise<ProactiveDismissResult> {
  const payload = await requestJson<{ candidate?: unknown; batch?: unknown }>(
    `/proactive/candidates/${candidateId}/dismiss`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
  return {
    candidate: normalizeProactiveCandidate(payload.candidate),
    batch: normalizeProactiveBatch(payload.batch),
  };
}
