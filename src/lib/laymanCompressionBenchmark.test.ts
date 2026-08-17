import { describe, expect, it } from "vitest";

import {
  clearLaymanCompressionInstrumentation,
  compressForPromptWithPolicy,
  getLaymanCompressionInstrumentationReport,
  resetLaymanCompressionPolicy,
} from "@/lib/laymanCompressionPolicy";

type BenchmarkFixture = {
  name: string;
  context: "video_prose_context" | "codegraph_narrative" | "repo_investigator_memory";
  path: string;
  text: string;
  mustPreserve: string[];
};

const FIXTURES: BenchmarkFixture[] = [
  {
    name: "video-scene-writer",
    context: "video_prose_context",
    path: "/video-prompts/scene-writer.md",
    text: [
      "You are writing ONE scene of a repository tutorial video.",
      "Rules:",
      "- You could consider explaining architecture before syntax.",
      "- Return JSON only.",
      "Schema:",
      "```json",
      '{"title":"string","sentences":[{"text":"string","evidence_indexes":[0]}]}',
      "```",
      "Evidence path: src/lib/videoPipelineV2.ts",
      "Command: npm test && git diff --check",
      "URL: https://example.com/video-spec",
      "Symbol: buildSceneWriterPrompt",
    ].join("\n"),
    mustPreserve: [
      "```json",
      "src/lib/videoPipelineV2.ts",
      "npm test && git diff --check",
      "https://example.com/video-spec",
      "buildSceneWriterPrompt",
      '"sentences":[{"text":"string","evidence_indexes":[0]}]',
    ],
  },
  {
    name: "repo-investigator-memory",
    context: "repo_investigator_memory",
    path: "/repo-investigator-memory/prompt.md",
    text: [
      "You are NeoDevEx Repo Q&A.",
      "Rules:",
      "- You should always answer from evidence.",
      "- Return ONLY valid JSON.",
      "Knowledge graph context: This is basically where auth sessions are verified.",
      "Evidence pack:",
      "[1] auth guard reference",
      "src/auth/guard.ts:88",
      "`npm test` then `git diff --check`",
      "Question: Why does authenticateUser fail?",
    ].join("\n"),
    mustPreserve: [
      "Return ONLY valid JSON.",
      "src/auth/guard.ts:88",
      "`npm test` then `git diff --check`",
      "authenticateUser",
    ],
  },
  {
    name: "codegraph-narrative",
    context: "codegraph_narrative",
    path: "/codegraph-rag/narrative.md",
    text: [
      "=== REPOSITORY OVERVIEW ===",
      "Repository: reel-studio",
      "This is basically an architecture description that you could consider shortening.",
      "Path: src/core/auth.ts",
      "Symbol: authenticateUser",
      "URL: https://example.com/codegraph",
    ].join("\n"),
    mustPreserve: ["src/core/auth.ts", "authenticateUser", "https://example.com/codegraph"],
  },
];

describe("layman benchmark", () => {
  it("reports token savings, skipped counts, validation failures, and invariants", () => {
    resetLaymanCompressionPolicy();
    clearLaymanCompressionInstrumentation();

    let skippedCount = 0;
    let validationFailures = 0;
    let invariantFailures = 0;
    let totalSaved = 0;

    for (const fixture of FIXTURES) {
      const result = compressForPromptWithPolicy({
        context: fixture.context,
        path: fixture.path,
        text: fixture.text,
      });

      totalSaved += result.metrics.savedTokens;
      if (!result.usedCompression) skippedCount += 1;
      if (result.validation && !result.validation.isValid) validationFailures += 1;

      for (const token of fixture.mustPreserve) {
        if (!result.text.includes(token)) {
          invariantFailures += 1;
        }
      }
    }

    const report = getLaymanCompressionInstrumentationReport();
    const summary = {
      fixtureCount: FIXTURES.length,
      totalSavedTokens: totalSaved,
      skippedCount,
      validationFailures,
      preservedInvariantChecks: FIXTURES.reduce((sum, fixture) => sum + fixture.mustPreserve.length, 0),
      preservedInvariantFailures: invariantFailures,
      instrumentation: report,
    };

    // Deterministic benchmark output for local/dev checks.
    console.info(JSON.stringify({ event: "layman_benchmark", summary }, null, 2));

    expect(summary.fixtureCount).toBeGreaterThan(0);
    expect(summary.preservedInvariantFailures).toBe(0);
    expect(summary.validationFailures).toBe(0);
    expect(summary.totalSavedTokens).toBeGreaterThanOrEqual(0);
  });
});
