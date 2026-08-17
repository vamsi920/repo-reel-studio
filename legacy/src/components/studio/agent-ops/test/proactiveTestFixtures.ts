import type {
  ProactiveBatch,
  ProactiveCandidate,
  ProactiveLinkedRunSummary,
  ProactiveStatus,
} from "@/lib/proactiveAgentOps";

export function makeProactiveCandidate(
  id: string,
  overrides: Partial<ProactiveCandidate> = {},
): ProactiveCandidate {
  return {
    id,
    batchId: "batch-1",
    repoUrl: "https://github.com/o/r",
    status: "review_ready",
    type: "bug",
    title: `Candidate ${id}`,
    hypothesis: "Hypothesis",
    evidence: [],
    score: { signal: 0.8, validation: 0.7, centrality: 0.6, risk: 0.2, total: 0.75 },
    dedupeKey: `dedupe-${id}`,
    createdAt: "2026-05-27T12:00:00.000Z",
    updatedAt: "2026-05-27T12:00:00.000Z",
    ...overrides,
  };
}

export function makeProactiveStatus(overrides: Partial<ProactiveStatus> = {}): ProactiveStatus {
  return {
    config: {
      repoUrl: "https://github.com/o/r",
      enabled: true,
      targetCount: 6,
      qualityMode: "high",
      timezone: "UTC",
      morningDeadline: "09:00",
      updatedAt: "2026-05-27T12:00:00.000Z",
    },
    ready: 0,
    target: 6,
    candidates: [],
    batch: null,
    ...overrides,
  };
}

export function makeProactiveLinkedRun(
  overrides: Partial<ProactiveLinkedRunSummary> = {},
): ProactiveLinkedRunSummary {
  return {
    id: "run-linked-1",
    status: "awaiting_review",
    timeline: [],
    validation: { overallStatus: "not_run", commands: [], notes: [] },
    changedFiles: [],
    diffStat: "",
    hasPatch: false,
    testMatrix: { suites: [], overallStatus: "not_run", totalDurationMs: 0, passRate: 0 },
    ...overrides,
  };
}

export function makeProactiveBatch(overrides: Partial<ProactiveBatch> = {}): ProactiveBatch {
  return {
    id: "batch-1",
    date: "2026-05-27",
    status: "complete",
    targetCount: 6,
    progress: { discovered: 0, selected: 0, materialized: 0, ready: 0, dismissed: 0 },
    metrics: { qualityMode: "high", averageScore: 0 },
    ...overrides,
  };
}
