import { describe, expect, it, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  clearLaymanCompressionInstrumentation,
  compressForPromptWithPolicy,
  configureLaymanCompressionPolicy,
  evaluateLaymanPolicy,
  getLaymanCompressionInstrumentationReport,
  getLaymanIntegrationSafetyPolicy,
  getLaymanCompressionPolicy,
  resetLaymanCompressionPolicy,
} from "./compression-policy";

afterEach(() => {
  resetLaymanCompressionPolicy();
  clearLaymanCompressionInstrumentation();
});

describe("laymanCompressionPolicy", () => {
  it("has safe defaults enabled with full mode", () => {
    const policy = getLaymanCompressionPolicy();
    expect(policy.enabled).toBe(true);
    expect(policy.mode).toBe("full");
    expect(policy.minSavedTokens).toBeGreaterThanOrEqual(1);
  });

  it("enforces local deterministic safety boundary", () => {
    const safety = getLaymanIntegrationSafetyPolicy();
    expect(safety.localDeterministicOnly).toBe(true);
    expect(safety.mutatePersistedRepoFiles).toBe(false);
    expect(safety.createOriginalBackupFiles).toBe(false);
    expect(safety.callLaymanRemoteServices).toBe(false);
    expect(safety.callAnthropicForCompression).toBe(false);
  });

  it("denies when policy disabled", () => {
    configureLaymanCompressionPolicy({ enabled: false });
    const decision = evaluateLaymanPolicy("video_prose_context");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("policy_disabled");
  });

  it("returns original text with zero savings when disabled", () => {
    configureLaymanCompressionPolicy({ enabled: false });
    const input = "Please make sure to run tests before merge.";
    const result = compressForPromptWithPolicy({
      context: "video_prose_context",
      path: "/tmp/video.md",
      text: input,
      mode: "full",
    });
    expect(result.usedCompression).toBe(false);
    expect(result.text).toBe(input);
    expect(result.metrics.savedTokens).toBe(0);
    expect(result.metrics.originalTokens).toBe(result.metrics.compressedTokens);
    expect(result.policyDecision.reason).toBe("policy_disabled");
  });

  it("deny list overrides allow list", () => {
    configureLaymanCompressionPolicy({
      allowContexts: ["video_prose_context"],
      denyContexts: ["video_prose_context"],
    });
    const decision = evaluateLaymanPolicy("video_prose_context");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("context_denied");
  });

  it("rejects contexts not in allow list", () => {
    configureLaymanCompressionPolicy({
      allowContexts: ["video_prose_context"],
    });
    const decision = evaluateLaymanPolicy("codegraph_narrative");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("context_not_allowed");
  });

  it("applies configured mode and threshold for compression", () => {
    configureLaymanCompressionPolicy({
      mode: "ultra",
      minSavedTokens: 1,
      allowContexts: ["repo_investigator_memory"],
    });
    const result = compressForPromptWithPolicy({
      context: "repo_investigator_memory",
      path: "/tmp/memory.md",
      text: "Please make sure to run tests before merge. Additionally, you could consider linting.",
    });
    expect(result.mode).toBe("ultra");
    expect(result.policyDecision.allowed).toBe(true);
  });

  it("records instrumentation with context and token counts", () => {
    configureLaymanCompressionPolicy({
      debug: false,
      allowContexts: ["video_prose_context"],
    });
    compressForPromptWithPolicy({
      context: "video_prose_context",
      path: "/tmp/video.md",
      text: "Please make sure to run tests before merge.",
    });
    const report = getLaymanCompressionInstrumentationReport();
    expect(report.totalEvents).toBe(1);
    expect(report.byContext.video_prose_context.events).toBe(1);
    expect(
      report.byContext.video_prose_context.savedTokens,
    ).toBeGreaterThanOrEqual(0);
  });

  it("logs sanitized debug payload without raw prompt text", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    configureLaymanCompressionPolicy({
      debug: true,
      allowContexts: ["repo_investigator_memory"],
    });
    const secret = "SECRET_TOKEN_12345";
    const code = "function leak(){ return 42; }";
    compressForPromptWithPolicy({
      context: "repo_investigator_memory",
      path: "/tmp/memory.md",
      text: `Please summarize this note ${secret}\n${code}`,
    });
    expect(spy).toHaveBeenCalled();
    const logged = String(spy.mock.calls[0]?.[0] ?? "");
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(code);
    expect(logged).toContain("savedTokens");
    expect(logged).toContain("context");
    spy.mockRestore();
  });

  it("does not call network APIs for compression", () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(() => {
      throw new Error("network should not be used");
    });
    globalThis.fetch = fetchSpy;
    try {
      const result = compressForPromptWithPolicy({
        context: "video_prose_context",
        path: "/tmp/video.md",
        text: "Please make sure to run tests before merge.",
      });
      expect(result.usedCompression).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("never creates .original backup files in app integration", () => {
    const dir = mkdtempSync(join(tmpdir(), "layman-policy-"));
    const promptPath = join(dir, "prompt.md");
    const backupPath = join(dir, "prompt.original.md");
    writeFileSync(
      promptPath,
      "This is basically prompt prose for compression.",
    );

    const result = compressForPromptWithPolicy({
      context: "video_prose_context",
      path: promptPath,
      text: "This is basically prompt prose for compression.",
    });
    expect(result.usedCompression).toBe(true);
    expect(existsSync(backupPath)).toBe(false);
  });
});
