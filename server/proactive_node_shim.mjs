/**
 * Node proactive fallback + proxy helpers (aligned with Python proactive API).
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";

export const ACTIVE_BATCH_STATUSES = new Set(["queued", "discovering", "scoring", "materializing"]);
export const TERMINAL_BATCH_STATUSES = new Set(["complete", "failed", "cancelled"]);
const GITHUB_HTTPS_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i;
const LOCAL_PREFIX = "local://";
const STATUS_CANDIDATE_LIMIT = 6;

export function normalizeProactiveRepoUrl(repoUrl) {
  return typeof repoUrl === "string" ? repoUrl.trim().replace(/\/+$/, "") : "";
}

export function structuredProactiveDetail(message, code, { field, hint, errors } = {}) {
  const detail = { message, code };
  if (field) detail.field = field;
  if (hint) detail.hint = hint;
  if (errors?.length) detail.errors = errors;
  return detail;
}

export function validateProactiveRepoUrl(repoUrl, { field = "repoUrl" } = {}) {
  const raw = typeof repoUrl === "string" ? repoUrl.trim() : "";
  if (!raw) {
    return {
      ok: false,
      statusCode: 400,
      detail: structuredProactiveDetail("repoUrl is required", "missing_repo_url", { field }),
    };
  }

  if (raw.startsWith(LOCAL_PREFIX)) {
    const name = raw.slice(LOCAL_PREFIX.length).trim();
    if (!name) {
      return {
        ok: false,
        statusCode: 400,
        detail: structuredProactiveDetail(
          "local:// repo URLs must include a workspace name",
          "invalid_repo_url",
          { field },
        ),
      };
    }
    return { ok: true, value: normalizeProactiveRepoUrl(raw) };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      detail: structuredProactiveDetail("repoUrl must use http, https, or local://", "invalid_repo_url", {
        field,
      }),
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      ok: false,
      statusCode: 400,
      detail: structuredProactiveDetail("repoUrl must use http, https, or local://", "invalid_repo_url", {
        field,
      }),
    };
  }
  if (!parsed.hostname) {
    return {
      ok: false,
      statusCode: 400,
      detail: structuredProactiveDetail("repoUrl must include a host", "invalid_repo_url", { field }),
    };
  }
  if (parsed.protocol === "https:" && parsed.hostname.toLowerCase().includes("github.com")) {
    if (!GITHUB_HTTPS_RE.test(normalizeProactiveRepoUrl(raw))) {
      return {
        ok: false,
        statusCode: 400,
        detail: structuredProactiveDetail(
          "repoUrl must be a github.com repository URL (https://github.com/owner/repo)",
          "invalid_github_repo_url",
          { field },
        ),
      };
    }
  }

  return { ok: true, value: normalizeProactiveRepoUrl(raw) };
}

export function proactiveWriteBlockedResponse(kind) {
  const copy = {
    dispatch: {
      message: "Proactive dispatch requires the Python Agent Ops API.",
      hint:
        "Run `npm run agent:server` (port 8788), then restart ingestion with AGENT_RUNS_PROXY_URL=http://127.0.0.1:8788 — or use `npm run studio:backend`, `npm run dev:with-agent`, or `npm run ingest:server:python`.",
    },
    config: {
      message: "Saving proactive config requires the Python Agent Ops API.",
      hint:
        "Start the Agent API on port 8788 and set AGENT_RUNS_PROXY_URL=http://127.0.0.1:8788 on the Node ingestion server.",
    },
    candidateAction: {
      message: "Approving or dismissing proactive candidates requires the Python Agent Ops API.",
      hint:
        "Start the Agent API on port 8788 and set AGENT_RUNS_PROXY_URL=http://127.0.0.1:8788, or run `npm run ingest:server:python`.",
    },
  };
  const selected = copy[kind] || copy.dispatch;
  return {
    detail: structuredProactiveDetail(selected.message, "proactive_backend_required", {
      hint: selected.hint,
    }),
  };
}

export function proactiveProxyUnreachableResponse(baseUrl, err) {
  const reason = err instanceof Error ? err.message : String(err);
  return {
    detail: structuredProactiveDetail("Proactive Agent API is unreachable.", "proactive_proxy_unreachable", {
      hint: `Start the Agent API (npm run agent:server → port 8788) and set AGENT_RUNS_PROXY_URL=${baseUrl || "http://127.0.0.1:8788"} on Node ingestion. Underlying error: ${reason}`,
    }),
  };
}

export function coerceProactiveUpstreamBody(payload, statusCode) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const detail = payload.detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return payload;
  }
  if (typeof detail === "string" && detail.trim()) {
    const code =
      statusCode === 401
        ? "invalid_cron_token"
        : statusCode === 404
          ? "candidate_not_found"
          : statusCode === 409
            ? "candidate_already_dismissed"
            : "request_error";
    return { ...payload, detail: structuredProactiveDetail(detail.trim(), code) };
  }
  if (typeof payload.error === "string" && payload.error.trim() && !detail) {
    return {
      detail: structuredProactiveDetail(payload.error.trim(), "request_error", {
        hint: typeof payload.hint === "string" ? payload.hint : undefined,
      }),
    };
  }
  return payload;
}

export function batchProgressFromCandidates(candidates) {
  const selectedStatuses = new Set([
    "selected",
    "executing",
    "review_ready",
    "needs_execution",
    "approved",
    "approved_internal",
  ]);
  return {
    discovered: candidates.length,
    selected: candidates.filter((item) => selectedStatuses.has(String(item?.status || ""))).length,
    materialized: candidates.filter((item) => item?.runId).length,
    ready: candidates.filter((item) => item?.status === "review_ready").length,
    dismissed: candidates.filter((item) => item?.status === "dismissed").length,
  };
}

export function resolveStatusBatch(batches) {
  const actives = batches.filter((batch) => ACTIVE_BATCH_STATUSES.has(String(batch?.status || "")));
  if (actives.length) {
    return actives.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))[0];
  }
  return batches[0] || null;
}

export function resolveTargetCount(config, batch) {
  if (batch?.targetCount !== undefined && batch?.targetCount !== null) {
    const parsed = Number.parseInt(String(batch.targetCount), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(parsed, 6));
    }
  }
  const fromConfig = Number.parseInt(String(config?.targetCount || 6), 10);
  return Math.max(1, Math.min(Number.isFinite(fromConfig) ? fromConfig : 6, 6));
}

export function resolveShortfallReason(batch, { ready, target }) {
  if (!batch) return null;

  const status = String(batch.status || "");
  if (TERMINAL_BATCH_STATUSES.has(status) && status !== "failed" && ready >= target) {
    return null;
  }

  const stored = batch?.metrics?.shortfallReason;
  if (typeof stored === "string" && stored.trim()) {
    return stored.trim();
  }

  if (status === "failed") {
    return "Dispatch failed.";
  }
  if (ACTIVE_BATCH_STATUSES.has(status)) {
    const transitions = Array.isArray(batch.transitions) ? batch.transitions : [];
    const detail = transitions.length
      ? String(transitions[transitions.length - 1]?.detail || "").trim()
      : "";
    return detail || `Batch is ${status}.`;
  }
  if (TERMINAL_BATCH_STATUSES.has(status) && status !== "failed") {
    if (ready >= target) return null;
    return `${ready}/${target} review-ready candidates.`;
  }
  return null;
}

export function buildLocalStatusSummary({
  config,
  batches,
  listCandidatesForBatch,
  enrichCandidate,
}) {
  const batch = resolveStatusBatch(batches);
  const batchId = batch?.id ? String(batch.id) : "";
  const allInBatch = batchId ? listCandidatesForBatch(batchId, true) : [];
  const batchWithProgress = batch
    ? { ...batch, progress: batchProgressFromCandidates(allInBatch) }
    : null;
  const ready = batchWithProgress?.progress?.ready ?? 0;
  const target = resolveTargetCount(config, batchWithProgress);
  const visible = allInBatch
    .filter((item) => item?.status !== "dismissed")
    .sort((left, right) => {
      const leftScore = Number(left?.score?.total || 0);
      const rightScore = Number(right?.score?.total || 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    })
    .slice(0, STATUS_CANDIDATE_LIMIT)
    .map((item) => enrichCandidate(item));

  return {
    config,
    batch: batchWithProgress,
    ready,
    target,
    candidates: visible,
    shortfallReason: resolveShortfallReason(batchWithProgress, { ready, target }),
  };
}

export function createProactiveLocalStore({ storeRoot, readRunFromDisk, nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }) {
  function proactiveScopeKey(repoUrl, projectId = null) {
    const raw = `${normalizeProactiveRepoUrl(repoUrl)}::${String(projectId || "").trim()}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 24);
  }

  function proactiveScopeRoot(repoUrl, projectId = null) {
    return path.join(storeRoot, proactiveScopeKey(repoUrl, projectId));
  }

  function readJsonIfExists(fp) {
    if (!fs.existsSync(fp)) return null;
    try {
      return JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch {
      return null;
    }
  }

  function writeJson(fp, payload) {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(payload, null, 2), "utf8");
    return payload;
  }

  function readJsonObjects(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readJsonIfExists(path.join(dirPath, entry.name)))
      .filter(Boolean);
  }

  function getLocalProactiveConfig(repoUrl, projectId = null) {
    const normalizedRepoUrl = normalizeProactiveRepoUrl(repoUrl);
    const stored = readJsonIfExists(path.join(proactiveScopeRoot(normalizedRepoUrl, projectId), "config.json")) || {};
    return {
      repoUrl: normalizedRepoUrl,
      projectId: projectId ?? null,
      enabled: false,
      targetCount: 6,
      qualityMode: "high",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      morningDeadline: "09:00",
      updatedAt: nowIso(),
      ...stored,
      repoUrl: normalizedRepoUrl,
      projectId: projectId ?? null,
    };
  }

  function updateLocalProactiveConfig(repoUrl, projectId, patch) {
    const current = getLocalProactiveConfig(repoUrl, projectId);
    for (const key of ["enabled", "targetCount", "qualityMode", "timezone", "morningDeadline"]) {
      if (patch[key] !== undefined && patch[key] !== null) {
        current[key] = patch[key];
      }
    }
    current.enabled = Boolean(current.enabled);
    current.targetCount = Math.max(1, Math.min(Number.parseInt(String(current.targetCount || 6), 10) || 6, 6));
    current.qualityMode = String(current.qualityMode || "high");
    current.timezone = String(current.timezone || "local");
    current.morningDeadline = String(current.morningDeadline || "09:00");
    current.updatedAt = nowIso();
    return writeJson(path.join(proactiveScopeRoot(repoUrl, projectId), "config.json"), current);
  }

  function listLocalProactiveBatches(repoUrl, projectId = null, limit = 50) {
    const items = readJsonObjects(path.join(proactiveScopeRoot(repoUrl, projectId), "batches"));
    items.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    return items.slice(0, Math.max(1, Math.min(limit, 100)));
  }

  function listLocalProactiveCandidates(
    repoUrl,
    projectId = null,
    batchId = null,
    includeDismissed = false,
    limit = 100,
  ) {
    const items = readJsonObjects(path.join(proactiveScopeRoot(repoUrl, projectId), "candidates"))
      .filter((item) => !batchId || item.batchId === batchId)
      .filter((item) => includeDismissed || item.status !== "dismissed");
    items.sort((left, right) => {
      const leftScore = Number(left?.score?.total || 0);
      const rightScore = Number(right?.score?.total || 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    });
    return items.slice(0, Math.max(1, Math.min(limit, 500)));
  }

  function localRunConsoleSummary(runId) {
    const run = readRunFromDisk(runId);
    if (!run) return null;
    const artifacts = run.artifacts || {};
    const validation = artifacts.validation || {};
    const qualityGates = artifacts.qualityGates || {};
    const changeIntent = artifacts.changeIntent || {};
    return {
      id: run.id,
      status: run.status,
      updatedAt: run.updatedAt || null,
      startedAt: run.startedAt || null,
      completedAt: run.completedAt || null,
      issueTitle: run.issue?.title || run.plan?.summary || null,
      timeline: run.timeline || [],
      validation: {
        overallStatus: validation.overallStatus || "not_run",
        commands: validation.commands || [],
        notes: validation.notes || [],
      },
      changedFiles: artifacts.changedFiles || [],
      diffStat: artifacts.diffStat || "",
      hasPatch: Boolean(String(artifacts.patch || "").trim()),
      qualityGates: {
        recommendation: qualityGates.recommendation || null,
        allPassed: qualityGates.allPassed ?? null,
        gates: qualityGates.gates || [],
      },
      changeIntent: {
        hypothesis: changeIntent.hypothesis || null,
        evidenceSufficiency: changeIntent.evidenceSufficiency || null,
      },
      evaluation: run.evaluation || {},
    };
  }

  function enrichLocalProactiveCandidate(candidate) {
    return {
      ...candidate,
      linkedRun: localRunConsoleSummary(candidate.runId),
    };
  }

  function summarizeLocalProactiveStatus(repoUrl, projectId = null) {
    const config = getLocalProactiveConfig(repoUrl, projectId);
    const batches = listLocalProactiveBatches(repoUrl, projectId, 50);
    return buildLocalStatusSummary({
      config,
      batches,
      listCandidatesForBatch: (batchId, includeDismissed) =>
        listLocalProactiveCandidates(repoUrl, projectId, batchId, includeDismissed, 100),
      enrichCandidate: enrichLocalProactiveCandidate,
    });
  }

  function findLocalProactiveCandidate(candidateId) {
    if (!fs.existsSync(storeRoot)) return null;
    for (const entry of fs.readdirSync(storeRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = readJsonObjects(path.join(storeRoot, entry.name, "candidates")).find(
        (item) => item?.id === candidateId,
      );
      if (candidate) return candidate;
    }
    return null;
  }

  return {
    getLocalProactiveConfig,
    updateLocalProactiveConfig,
    listLocalProactiveCandidates,
    summarizeLocalProactiveStatus,
    enrichLocalProactiveCandidate,
    findLocalProactiveCandidate,
  };
}
