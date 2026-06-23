#!/usr/bin/env node
/**
 * Node proactive shim checks (pass 18/40).
 * Run: node --test server/validate_proactive_node_shim.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  batchProgressFromCandidates,
  buildLocalStatusSummary,
  coerceProactiveUpstreamBody,
  proactiveProxyUnreachableResponse,
  proactiveWriteBlockedResponse,
  resolveShortfallReason,
  validateProactiveRepoUrl,
} from "./proactive_node_shim.mjs";

const REPO = "https://github.com/example/proactive-node.git";

describe("validateProactiveRepoUrl", () => {
  it("rejects missing repoUrl with structured detail", () => {
    const result = validateProactiveRepoUrl("   ");
    assert.equal(result.ok, false);
    assert.equal(result.detail.code, "missing_repo_url");
    assert.equal(result.detail.field, "repoUrl");
  });

  it("rejects invalid github repo paths", () => {
    const result = validateProactiveRepoUrl("https://github.com/only-owner");
    assert.equal(result.ok, false);
    assert.equal(result.detail.code, "invalid_github_repo_url");
  });

  it("accepts github and local repos", () => {
    assert.equal(validateProactiveRepoUrl(REPO).value, REPO);
    assert.equal(validateProactiveRepoUrl("local://fixture").value, "local://fixture");
  });
});

describe("status summary parity", () => {
  it("matches python-ready/target/shortfall fields", () => {
    const config = { targetCount: 2 };
    const batches = [
      {
        id: "batch-1",
        status: "complete",
        targetCount: 2,
        createdAt: "2026-01-02T00:00:00Z",
        metrics: { shortfallReason: null },
        transitions: [],
      },
    ];
    const candidates = [
      { id: "a", status: "review_ready", score: { total: 0.9 }, createdAt: "2026-01-02T00:00:00Z" },
      { id: "b", status: "review_ready", score: { total: 0.8 }, createdAt: "2026-01-02T00:00:00Z" },
      { id: "c", status: "dismissed", score: { total: 0.7 }, createdAt: "2026-01-02T00:00:00Z" },
    ];
    const summary = buildLocalStatusSummary({
      config,
      batches,
      listCandidatesForBatch: () => candidates,
      enrichCandidate: (item) => ({ ...item, linkedRun: null }),
    });
    assert.equal(summary.ready, 2);
    assert.equal(summary.target, 2);
    assert.equal(summary.candidates.length, 2);
    assert.equal(summary.shortfallReason, null);
    assert.equal(summary.batch.progress.ready, 2);
  });

  it("derives shortfall when below target", () => {
    const batch = {
      status: "complete",
      metrics: {},
      transitions: [],
    };
    assert.equal(resolveShortfallReason(batch, { ready: 1, target: 2 }), "1/2 review-ready candidates.");
  });
});

describe("proxy + write responses", () => {
  it("preserves structured upstream errors", () => {
    const body = coerceProactiveUpstreamBody(
      { detail: { message: "Invalid proactive cron token", code: "invalid_cron_token" } },
      401,
    );
    assert.equal(body.detail.code, "invalid_cron_token");
  });

  it("coerces string upstream errors", () => {
    const body = coerceProactiveUpstreamBody({ detail: "Candidate not found" }, 404);
    assert.equal(body.detail.code, "candidate_not_found");
  });

  it("write-blocked responses include hints", () => {
    const blocked = proactiveWriteBlockedResponse("dispatch");
    assert.equal(blocked.detail.code, "proactive_backend_required");
    assert.match(blocked.detail.hint, /agent:server/i);
  });

  it("proxy unreachable responses stay actionable", () => {
    const payload = proactiveProxyUnreachableResponse("http://127.0.0.1:8788", new Error("fetch failed"));
    assert.equal(payload.detail.code, "proactive_proxy_unreachable");
    assert.match(payload.detail.hint, /8788/);
    assert.match(payload.detail.hint, /fetch failed/);
  });
});

console.log("OK: proactive node shim");
