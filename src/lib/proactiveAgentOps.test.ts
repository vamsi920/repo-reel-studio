import { describe, expect, it } from "vitest";
import {
  extractHttpErrorParts,
  formatProactiveApiErrorDetail,
  normalizeProactiveCandidate,
  normalizeProactiveStatus,
  unwrapProactiveErrorDetail,
} from "@/lib/proactiveAgentOps";

describe("proactive error unwrapping", () => {
  it("unwrapProactiveErrorDetail flattens nested FastAPI detail", () => {
    const inner = {
      message: "Invalid proactive cron token",
      code: "invalid_cron_token",
      hint: "Send Authorization header",
    };
    expect(unwrapProactiveErrorDetail({ detail: inner })).toEqual(inner);
    expect(unwrapProactiveErrorDetail({ detail: { detail: inner } })).toEqual(inner);
  });

  it("extractHttpErrorParts prefers structured detail and hint", () => {
    const parts = extractHttpErrorParts({
      detail: { message: "repoUrl is required", code: "missing_repo_url", field: "repoUrl" },
      hint: "Provide a GitHub URL",
    });
    expect(parts.hint).toBe("Provide a GitHub URL");
    expect(formatProactiveApiErrorDetail(parts.detail)).toContain("repoUrl is required");
  });

  it("formatProactiveApiErrorDetail handles double-wrapped HTTP payloads", () => {
    const msg = formatProactiveApiErrorDetail({
      detail: {
        detail: {
          message: "Candidate not found",
          code: "candidate_not_found",
        },
      },
    });
    expect(msg).toContain("Candidate not found");
    expect(msg).toContain("candidate_not_found");
  });
});

describe("proactive status normalization", () => {
  it("normalizeProactiveStatus fills defaults when backend omits fields", () => {
    const status = normalizeProactiveStatus({
      config: { repoUrl: "https://github.com/o/r", enabled: true },
      ready: "2",
      candidates: [
        {
          id: "c1",
          batchId: "b1",
          status: "review_ready",
          score: { total: 0.9 },
        },
      ],
    });

    expect(status.config.repoUrl).toBe("https://github.com/o/r");
    expect(status.config.targetCount).toBeGreaterThanOrEqual(1);
    expect(status.ready).toBe(2);
    expect(status.candidates).toHaveLength(1);
    expect(status.candidates[0].score.total).toBe(0.9);
    expect(status.candidates[0].evidence).toEqual([]);
    expect(status.batch).toBeNull();
    expect(status.shortfallReason).toBeNull();
  });

  it("normalizeProactiveCandidate preserves unknown backend statuses", () => {
    const candidate = normalizeProactiveCandidate({
      id: "c2",
      batchId: "b1",
      status: "needs_execution",
      type: "improvement",
      executionFailure: {
        kind: "no_patch",
        label: "No patch",
        reason: "Executor returned empty",
      },
    });
    expect(candidate.status).toBe("needs_execution");
    expect(candidate.executionFailure?.kind).toBe("no_patch");
    expect(candidate.score.signal).toBe(0);
  });

  it("normalizeProactiveStatus derives ready from candidates when missing", () => {
    const status = normalizeProactiveStatus({
      config: { repoUrl: "https://github.com/o/r" },
      candidates: [
        { id: "a", batchId: "b", status: "review_ready" },
        { id: "b", batchId: "b", status: "needs_execution" },
      ],
    });
    expect(status.ready).toBe(1);
    expect(status.target).toBe(6);
  });
});
