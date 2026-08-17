import { describe, expect, it } from "vitest";

import {
  compressMarkdownProseOnly,
  compressMarkdownProseOnlyWithValidation,
  compressForPrompt,
  compressLaymanProseDeterministic,
  buildLaymanCompressionPayload,
  detectCompressionContentKind,
  detectSensitivePath,
  estimateTokens,
  summarizeTokenEstimates,
  estimateTokenMetrics,
  evaluateCompressionEligibility,
  segmentMarkdownForCompression,
  validateCompressedMarkdown,
} from "@/lib/laymanCompressionCore";

describe("laymanCompressionCore", () => {
  describe("detectSensitivePath", () => {
    it("matches sensitive basenames", () => {
      expect(detectSensitivePath("/tmp/.env.production")).toEqual({
        matched: true,
        reason: "sensitive_basename",
      });
    });

    it("matches sensitive path components", () => {
      expect(detectSensitivePath("/Users/test/.ssh/config")).toEqual({
        matched: true,
        reason: "sensitive_path_component",
      });
    });

    it("matches sensitive name tokens", () => {
      expect(detectSensitivePath("docs/api-key-rotation-notes.md")).toEqual({
        matched: true,
        reason: "sensitive_name_token",
      });
    });
  });

  describe("evaluateCompressionEligibility", () => {
    it("accepts markdown prose", () => {
      const result = evaluateCompressionEligibility({
        path: "/repo/docs/note.md",
        content: "# Notes\n\nThis is plain English.",
      });
      expect(result).toEqual({ shouldCompress: true, reason: null, refusal: null });
    });

    it("skips code/config and backup files", () => {
      expect(
        evaluateCompressionEligibility({
          path: "/repo/src/app.ts",
          content: "export const x = 1;",
        }),
      ).toMatchObject({ shouldCompress: false, reason: "not_natural_language" });

      expect(
        evaluateCompressionEligibility({
          path: "/repo/docs/plan.original.md",
          content: "backup",
        }),
      ).toMatchObject({ shouldCompress: false, reason: "already_backup_file" });
    });
  });

  describe("sensitive-path refusal and payload safety", () => {
    it("returns clear refusal reasons for sensitive paths", () => {
      const sensitiveFiles = [
        "/repo/.env",
        "/repo/keys/service-account.pem",
        "/repo/ops/id_rsa",
        "/Users/me/.ssh/config",
        "/Users/me/.aws/credentials",
        "/Users/me/.kube/config",
        "/Users/me/.docker/config.json",
        "/repo/docs/oauth-token-notes.md",
      ];
      for (const path of sensitiveFiles) {
        const result = evaluateCompressionEligibility({
          path,
          content: "Sensitive text that should never be compressed.",
        });
        expect(result.shouldCompress).toBe(false);
        expect(result.reason).toBe("sensitive_path");
        expect(result.refusal?.code).toBe("sensitive_path");
        expect(result.refusal?.message.toLowerCase()).toContain("refusing compression");
      }
    });

    it("never includes sensitive file content in compression payloads", () => {
      const content = "API token: super-secret-value";
      const built = buildLaymanCompressionPayload({
        path: "/repo/docs/private-token.md",
        content,
        mode: "summary",
      });
      expect(built.payload).toBeNull();
      expect(built.refusal?.code).toBe("sensitive_path");
    });

    it("builds payload only for eligible non-sensitive prose", () => {
      const built = buildLaymanCompressionPayload({
        path: "/repo/docs/release-notes.md",
        content: "# Notes\n\nEverything is ready.",
        mode: "summary",
      });
      expect(built.refusal).toBeNull();
      expect(built.payload?.sourceText).toContain("Everything is ready.");
      expect(built.payload?.segments.length).toBeGreaterThan(0);
    });
  });

  describe("detectCompressionContentKind", () => {
    it("classifies markdown docs as natural language", () => {
      const kind = detectCompressionContentKind(
        "/repo/docs/overview.md",
        "# Overview\n\nThis describes how the system works.",
      );
      expect(kind).toBe("natural_language");
    });

    it("classifies TypeScript/Python as code", () => {
      expect(
        detectCompressionContentKind("/repo/src/app.ts", "export const run = () => console.log('ok');"),
      ).toBe("code");
      expect(detectCompressionContentKind("/repo/server/main.py", "def run():\n    return True\n")).toBe(
        "code",
      );
    });

    it("classifies JSON/YAML as config", () => {
      expect(
        detectCompressionContentKind("/repo/config/settings.json", '{"feature": true, "count": 3}'),
      ).toBe("config");
      expect(
        detectCompressionContentKind(
          "/repo/config/settings.yml",
          "feature: true\nlimits:\n  retries: 3\n",
        ),
      ).toBe("config");
    });

    it("classifies lockfiles as generated", () => {
      expect(
        detectCompressionContentKind("/repo/package-lock.json", '{"name":"app","lockfileVersion":3}'),
      ).toBe("generated");
      expect(detectCompressionContentKind("/repo/yarn.lock", "left-pad@1.0.0:\n  version \"1.0.0\"")).toBe(
        "generated",
      );
    });

    it("classifies minified files as generated", () => {
      const minified = `function a(){return 1};${"x=1;".repeat(200)}`;
      expect(detectCompressionContentKind("/repo/dist/index.min.js", minified)).toBe("generated");
    });

    it("classifies image assets as binary", () => {
      expect(detectCompressionContentKind("/repo/assets/logo.png", "\u0000PNG\u0000DATA")).toBe("binary");
    });

    it("classifies unknown extension by heuristic", () => {
      expect(
        detectCompressionContentKind("/repo/notes.abc", "These are release notes and operator instructions."),
      ).toBe("natural_language");
      expect(
        detectCompressionContentKind("/repo/unknown.xyz", "const x = 1;\nif (x) { console.log(x); }\n"),
      ).toBe("code");
    });
  });

  describe("segmentMarkdownForCompression", () => {
    it("segments prose and fenced code", () => {
      const input = [
        "# Title",
        "",
        "Explain this section.",
        "```ts",
        "const x = 1;",
        "```",
        "",
        "More prose.",
      ].join("\n");

      const segments = segmentMarkdownForCompression(input);
      expect(segments.map((segment) => segment.kind)).toEqual(["prose", "code_fence", "prose"]);
      expect(segments[1].text).toContain("const x = 1;");
    });

    it("keeps nested fences inside outer fence intact", () => {
      const input = [
        "Intro",
        "````markdown",
        "```ts",
        "const inner = true;",
        "```",
        "````",
        "Outro",
      ].join("\n");

      const segments = segmentMarkdownForCompression(input);
      expect(segments).toHaveLength(3);
      expect(segments[1].kind).toBe("code_fence");
      expect(segments[1].text).toContain("const inner = true;");
      expect(segments[1].text.startsWith("````markdown")).toBe(true);
      expect(segments[1].text.endsWith("````")).toBe(true);
    });
  });

  describe("compressMarkdownProseOnly", () => {
    it("preserves tables, urls, links, inline code, commands, dates, versions, env vars", () => {
      const markdown = [
        "# Release Notes",
        "",
        "| Name | Value |",
        "| --- | --- |",
        "| URL | https://example.com/docs |",
        "",
        "Run npm test before deploy.",
        "Use `npm run build` and [docs](https://example.com/readme).",
        "Path: ./src/lib/file.ts and env VITE_API_KEY.",
        "Release date 2026-05-27 on version v2.5.1.",
      ].join("\n");

      const compressed = compressMarkdownProseOnly(markdown, (prose) => prose.toUpperCase());

      expect(compressed).toContain("# Release Notes");
      expect(compressed).toContain("| Name | Value |");
      expect(compressed).toContain("https://example.com/docs");
      expect(compressed).toContain("[docs](https://example.com/readme)");
      expect(compressed).toContain("`npm run build`");
      expect(compressed).toContain("./src/lib/file.ts");
      expect(compressed).toContain("VITE_API_KEY");
      expect(compressed).toContain("2026-05-27");
      expect(compressed).toContain("v2.5.1");
    });

    it("never mutates fenced command blocks while simplifying prose", () => {
      const markdown = [
        "Before command block text.",
        "```bash",
        "npm install",
        "npm test",
        "```",
        "After command block text.",
      ].join("\n");

      const compressed = compressMarkdownProseOnly(markdown, (prose) => prose.replaceAll("text", "copy"));
      expect(compressed).toContain("npm install");
      expect(compressed).toContain("npm test");
      expect(compressed).toContain("Before command block copy.");
      expect(compressed).toContain("After command block copy.");
    });

    it("handles markdown edge cases without mutating protected content", () => {
      const markdown = [
        "# Release Notes: v2.5.1!",
        "## Ordered Plan (Phase 1):",
        "",
        "1. Run setup with `npm run build`.",
        "2. Validate links in [docs](https://example.com/docs?ref=guide&v=2).",
        "3. Use command `git diff --check` before merge.",
        "",
        "- Top bullet",
        "  - Nested level 2",
        "    - Nested level 3",
        "      - Nested level 4 with path C:\\repo\\src\\app.ts and /usr/local/bin/tool",
        "",
        "| Name | Value | Notes |",
        "| --- | --- | --- |",
        "| URL | https://example.com/api?x=1&y=2 | keep exact |",
        "| Path | ./src/lib/videoPipelineV2.ts | keep exact |",
        "",
        "~~~bash",
        "npm test",
        "git status",
        "~~~",
        "",
        "````markdown",
        "```ts",
        "const x = 1;",
        "```",
        "````",
        "",
        "Inline command `python3 -m unittest` and env `VITE_API_URL` stay exact.",
      ].join("\n");

      const compressed = compressMarkdownProseOnly(markdown, (proseTemplate) =>
        compressLaymanProseDeterministic(proseTemplate, "ultra").output,
      );
      const validation = validateCompressedMarkdown(markdown, compressed);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(compressed).toContain("````markdown");
      expect(compressed).toContain("```ts");
      expect(compressed).toContain("const x = 1;");
      expect(compressed).toContain("~~~bash");
      expect(compressed).toContain("npm test");
      expect(compressed).toContain("git status");
      expect(compressed).toContain("[docs](https://example.com/docs?ref=guide&v=2)");
      expect(compressed).toContain("https://example.com/api?x=1&y=2");
      expect(compressed).toContain("./src/lib/videoPipelineV2.ts");
      expect(compressed).toContain("C:\\repo\\src\\app.ts");
      expect(compressed).toContain("/usr/local/bin/tool");
      expect(compressed).toContain("`git diff --check`");
      expect(compressed).toContain("`python3 -m unittest`");
      expect(compressed).toContain("`VITE_API_URL`");
      expect(compressed).toContain("| Name | Value | Notes |");
      expect(compressed).toContain("1. Run setup");
      expect(compressed).toContain("2. Validate links");
      expect(compressed).toContain("3. Use command");
    });
  });

  describe("compressLaymanProseDeterministic", () => {
    it("compresses Layman README style explanation in lite mode", () => {
      const before =
        "You should always make sure to run the test suite before pushing any changes to the main branch. This is important because it helps catch bugs early and prevents broken builds from being deployed to production.";
      const result = compressLaymanProseDeterministic(before, "lite");
      expect(result.output).toContain("run the test suite before pushing");
      expect(result.output.toLowerCase()).not.toContain("make sure to");
      expect(result.changed).toBe(true);
    });

    it("compresses Layman architecture example in full mode", () => {
      const before =
        "The application uses a microservices architecture with the following components. The API gateway handles all incoming requests and routes them to the appropriate service. The authentication service is responsible for managing user sessions and JWT tokens.";
      const result = compressLaymanProseDeterministic(before, "full");
      expect(result.output.toLowerCase()).toContain("microservices architecture");
      expect(result.output.toLowerCase()).toContain("api gateway handles all incoming requests");
      expect(result.output.toLowerCase()).toContain("jwt tokens");
      expect(result.changed).toBe(true);
    });

    it("ultra mode removes extra framing from repo-style prompt text", () => {
      const before = [
        "Please make sure to review the Agent Ops run summary before merge.",
        "Additionally, you could consider validating the proactive candidate checks in order to avoid regressions.",
        "It would be good to run npm test and npm run build.",
      ].join(" ");
      const result = compressLaymanProseDeterministic(before, "ultra");
      expect(result.output.toLowerCase()).toContain("review the agent ops run summary before merge");
      expect(result.output.toLowerCase()).toContain("run npm test and npm run build");
      expect(result.output.toLowerCase()).not.toContain("additionally");
      expect(result.output.toLowerCase()).not.toContain("you could consider");
      expect(result.output.length).toBeLessThan(before.length);
    });
  });

  describe("estimateTokenMetrics", () => {
    it("computes estimated savings", () => {
      const metrics = estimateTokenMetrics(
        "This text is verbose and repeated. This text is verbose and repeated.",
        "Short text.",
      );
      expect(metrics.before.estimatedTokens).toBeGreaterThan(metrics.after.estimatedTokens);
      expect(metrics.savedTokens).toBeGreaterThan(0);
      expect(metrics.savedRatio).toBeGreaterThan(0);
    });

    it("is monotonic with shorter compressed text", () => {
      const original = "This is a longer sentence with several words and extra framing.";
      const compressed = "Short sentence.";
      const originalTokens = estimateTokens(original);
      const compressedTokens = estimateTokens(compressed);
      expect(compressedTokens).toBeLessThanOrEqual(originalTokens);
    });

    it("handles empty and short inputs", () => {
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("ok")).toBeGreaterThanOrEqual(1);

      const summary = summarizeTokenEstimates({
        mode: "lite",
        originalText: "",
        compressedText: "",
      });
      expect(summary).toEqual({
        mode: "lite",
        originalTokens: 0,
        compressedTokens: 0,
        savedTokens: 0,
      });
    });

    it("returns summary with mode and saved token fields", () => {
      const summary = summarizeTokenEstimates({
        mode: "ultra",
        originalText: "You should always make sure to run the tests before pushing.",
        compressedText: "Run tests before push.",
      });
      expect(summary.mode).toBe("ultra");
      expect(summary.originalTokens).toBeGreaterThanOrEqual(summary.compressedTokens);
      expect(summary.savedTokens).toBe(summary.originalTokens - summary.compressedTokens);
    });
  });

  describe("validateCompressedMarkdown", () => {
    const original = [
      "# Heading",
      "",
      "- Item one",
      "- Item two",
      "",
      "Use `npm test`",
      "",
      "```bash",
      "echo ok",
      "```",
      "",
      "Link: https://example.com/docs",
      "Path: ./src/app.ts",
    ].join("\n");

    it("passes when invariants are preserved", () => {
      const compressed = [
        "# Heading",
        "",
        "- Item one",
        "- Item two",
        "",
        "Run `npm test` now.",
        "",
        "```bash",
        "echo ok",
        "```",
        "",
        "Link: https://example.com/docs",
        "Path: ./src/app.ts",
      ].join("\n");

      const result = validateCompressedMarkdown(original, compressed);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails on heading/code/url drift", () => {
      const compressed = [
        "# Changed heading",
        "",
        "- Item one",
        "",
        "```bash",
        "echo changed",
        "```",
        "",
        "Link: https://different.example.com",
      ].join("\n");

      const result = validateCompressedMarkdown(original, compressed);
      expect(result.isValid).toBe(false);
      expect(result.errors.map((item) => item.code)).toEqual(
        expect.arrayContaining([
          "heading_text_or_order_changed",
          "code_blocks_not_preserved",
          "url_mismatch",
        ]),
      );
    });

    it("fails when inline code or table shape drifts", () => {
      const originalWithTable = [
        "# Heading",
        "",
        "| Col A | Col B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "Use `npm run build` then `npm test`.",
      ].join("\n");
      const bad = [
        "# Heading",
        "",
        "| Col A | Col B | Col C |",
        "| --- | --- | --- |",
        "| 1 | 2 | 3 |",
        "",
        "Use `npm run dev` then `npm test`.",
      ].join("\n");

      const result = validateCompressedMarkdown(originalWithTable, bad);
      expect(result.isValid).toBe(false);
      expect(result.errors.map((item) => item.code)).toEqual(
        expect.arrayContaining(["inline_code_mismatch", "table_shape_mismatch"]),
      );
    });

    it("warns on path and bullet drift", () => {
      const compressed = [
        "# Heading",
        "",
        "No bullets now.",
        "",
        "Use `npm test`",
        "",
        "```bash",
        "echo ok",
        "```",
        "",
        "Link: https://example.com/docs",
        "Path: ./src/other.ts",
      ].join("\n");

      const result = validateCompressedMarkdown(original, compressed);
      expect(result.warnings.map((item) => item.code)).toEqual(
        expect.arrayContaining(["path_mismatch", "bullet_count_changed"]),
      );
    });
  });

  describe("compressMarkdownProseOnlyWithValidation", () => {
    it("returns compressed text on valid output", () => {
      const markdown = ["# Title", "", "Run `npm test` before push.", "", "| A | B |", "| - | - |"].join("\n");
      const result = compressMarkdownProseOnlyWithValidation(markdown, (prose) =>
        prose.replace("before push", "before merge"),
      );
      expect(result.revertedToOriginal).toBe(false);
      expect(result.text).toContain("before merge");
      expect(result.validation.isValid).toBe(true);
    });

    it("keeps compressed text when validation has warnings only", () => {
      const markdown = ["# Title", "", "- one", "- two", "- three", "", "Use `npm test`."].join("\n");
      const result = compressMarkdownProseOnlyWithValidation(markdown, (prose) =>
        prose.replaceAll(/^\s*-\s+/gm, ""),
      );
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.warnings.map((item) => item.code)).toEqual(
        expect.arrayContaining(["bullet_count_changed"]),
      );
      expect(result.revertedToOriginal).toBe(false);
    });

    it("returns original text on hard-fail validation", () => {
      const markdown = [
        "# Title",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "Run `npm test` before merge.",
      ].join("\n");
      const result = compressMarkdownProseOnlyWithValidation(markdown, (prose) =>
        prose
          .replaceAll(/@@\d+@@/g, "")
          .replace("before merge", "before deploy"),
      );
      expect(result.revertedToOriginal).toBe(true);
      expect(result.text).toBe(markdown);
      expect(result.validation.isValid).toBe(false);
    });
  });

  describe("compressForPrompt", () => {
    it("falls back unsafe for sensitive paths", () => {
      const input = "Token details should stay local.";
      const result = compressForPrompt(input, { path: "/repo/.env", mode: "lite" });
      expect(result.usedCompression).toBe(false);
      expect(result.fallbackReason).toBe("unsafe");
      expect(result.text).toBe(input);
      expect(result.metrics.savedTokens).toBe(0);
    });

    it("falls back noncompressible for code/config content", () => {
      const input = "export const run = () => 1;";
      const result = compressForPrompt(input, { path: "/repo/src/app.ts", mode: "full" });
      expect(result.usedCompression).toBe(false);
      expect(result.fallbackReason).toBe("noncompressible");
      expect(result.text).toBe(input);
    });

    it("falls back validation_failed when compressed output breaks invariants", () => {
      const input = ["# Title", "", "Use `npm test` before merge."].join("\n");
      const result = compressForPrompt(input, {
        path: "/repo/docs/notes.md",
        mode: "ultra",
        simplifyProse: (template) => template.replaceAll(/@@\d+@@/g, ""),
      });
      expect(result.usedCompression).toBe(false);
      expect(result.fallbackReason).toBe("validation_failed");
      expect(result.text).toBe(input);
      expect(result.validation?.isValid).toBe(false);
    });

    it("falls back savings_too_small when below threshold", () => {
      const input = "# Notes\n\nRun tests.";
      const result = compressForPrompt(input, {
        path: "/repo/docs/notes.md",
        mode: "lite",
        minSavedTokens: 10,
      });
      expect(result.usedCompression).toBe(false);
      expect(result.fallbackReason).toBe("savings_too_small");
      expect(result.text).toBe(input);
    });

    it("returns compressed text with observability fields on success", () => {
      const input =
        "Please make sure to run the test suite before push. Additionally, you could consider a quick build.";
      const result = compressForPrompt(input, {
        path: "/repo/docs/notes.md",
        mode: "ultra",
        minSavedTokens: 1,
      });
      expect(result.usedCompression).toBe(true);
      expect(result.fallbackReason).toBeNull();
      expect(result.metrics.originalTokens).toBeGreaterThanOrEqual(result.metrics.compressedTokens);
      expect(result.metrics.savedTokens).toBeGreaterThan(0);
      expect(result.mode).toBe("ultra");
    });

    it("skips compression when context exceeds maxContextChars", () => {
      const big = `# Notes\n\n${"Please make sure to run all checks before merge. ".repeat(2000)}`;
      const result = compressForPrompt(big, {
        path: "/repo/docs/huge.md",
        mode: "full",
        maxContextChars: 4_000,
      });
      expect(result.usedCompression).toBe(false);
      expect(result.fallbackReason).toBe("noncompressible");
      expect(result.eligibility.reason).toBe("file_too_large");
      expect(result.text).toBe(big);
    });
  });

  describe("performance safeguards", () => {
    it("handles large synthetic markdown quickly with segment caps", () => {
      const largeSegment = [
        "# Large Prompt",
        "",
        "```ts",
        "export const keepExact = true;",
        "```",
        "",
        `${"Additionally, you could consider validating every step before deploy. ".repeat(4000)}`,
      ].join("\n");

      const start = Date.now();
      const result = compressForPrompt(largeSegment, {
        path: "/repo/docs/large.md",
        mode: "full",
        maxContextChars: 400_000,
        maxSegmentChars: 8_000,
        minSavedTokens: 1,
      });
      const elapsedMs = Date.now() - start;

      expect(elapsedMs).toBeLessThan(1200);
      expect(result.text).toContain("export const keepExact = true;");
      expect(result.text.length).toBeGreaterThan(0);
    });
  });
});
