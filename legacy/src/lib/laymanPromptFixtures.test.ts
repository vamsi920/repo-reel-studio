import { describe, expect, it } from "vitest";

import { compressForPromptWithPolicy, resetLaymanCompressionPolicy } from "@/lib/laymanCompressionPolicy";

describe("layman prompt fixture safety", () => {
  it("preserves video prompt schema, fences, paths, commands, urls, and symbols", () => {
    resetLaymanCompressionPolicy();
    const fixture = [
      "You are writing ONE scene of a repository tutorial video.",
      "",
      "Rules:",
      "- You could consider explaining why this module exists before syntax.",
      "- Return JSON only.",
      "",
      "Schema:",
      "```json",
      '{',
      '  "title": "string",',
      '  "sentences": [{"text": "string", "evidence_indexes": [0]}]',
      "}",
      "```",
      "",
      "Scene evidence:",
      '[{"index":0,"file_path":"src/lib/videoPipelineV2.ts","symbol_name":"buildSceneWriterPrompt","excerpt":"npm test && git diff --check"}]',
      "Docs: https://example.com/specs/video-schema",
    ].join("\n");

    const result = compressForPromptWithPolicy({
      context: "video_prose_context",
      path: "/video-prompts/scene-writer.md",
      text: fixture,
      mode: "full",
      minSavedTokens: 1,
    });

    expect(result.text).toContain("```json");
    expect(result.text).toContain('"title": "string"');
    expect(result.text).toContain("src/lib/videoPipelineV2.ts");
    expect(result.text).toContain("buildSceneWriterPrompt");
    expect(result.text).toContain("npm test && git diff --check");
    expect(result.text).toContain("https://example.com/specs/video-schema");
    expect(result.text.length).toBeLessThan(fixture.length);
  });

  it("preserves repo-investigator question/evidence anchors while shrinking memory prose", () => {
    resetLaymanCompressionPolicy();
    const fixture = [
      "You are NeoDevEx Repo Q&A, a principal engineer assistant.",
      "",
      "Rules:",
      "- You should always answer from evidence and you could consider keeping responses concise.",
      "- Return ONLY valid JSON.",
      "",
      "Knowledge graph context:",
      "1. Auth Capsule [security] — This is basically where session checks are implemented.",
      "",
      "Evidence pack:",
      "[1] auth guard ensures token validation",
      "src/auth/guard.ts:88",
      "`npm test` then `git diff --check`",
      "",
      "Question: Why does authenticateUser fail when token expires?",
    ].join("\n");

    const result = compressForPromptWithPolicy({
      context: "repo_investigator_memory",
      path: "/repo-investigator-memory/prompt.md",
      text: fixture,
      mode: "full",
      minSavedTokens: 1,
    });

    expect(result.text).toContain("Question: Why does authenticateUser fail when token expires?");
    expect(result.text).toContain("src/auth/guard.ts:88");
    expect(result.text).toContain("`npm test` then `git diff --check`");
    expect(result.text).toContain("Return ONLY valid JSON.");
    expect(result.text.length).toBeLessThan(fixture.length);
  });

  it("preserves repo prompt edge-case code and artifact blocks exactly", () => {
    resetLaymanCompressionPolicy();
    const tsImportBlock = ["```ts", "import { z } from \"zod\";", "import React from \"react\";", "```"].join("\n");
    const reactBlock = [
      "```tsx",
      "export function Card(){",
      "  return <div className=\"p-4\">Hello</div>;",
      "}",
      "```",
    ].join("\n");
    const shellBlock = ["```bash", "npm run build", "git diff --check", "```"].join("\n");
    const diffBlock = [
      "```diff",
      "- const enabled = false;",
      "+ const enabled = true;",
      "```",
    ].join("\n");
    const stackTraceBlock = [
      "```text",
      "Error: boom",
      "    at runTask (src/lib/tasks.ts:42:13)",
      "    at main (src/index.ts:9:1)",
      "```",
    ].join("\n");
    const packageScriptsBlock = [
      "```json",
      '{',
      '  "scripts": {',
      '    "build": "vite build",',
      '    "test": "vitest run"',
      "  }",
      "}",
      "```",
    ].join("\n");
    const mermaidBlock = [
      "```mermaid",
      "flowchart LR",
      "A[Ingest] --> B[Compress]",
      "B --> C[Review]",
      "```",
    ].join("\n");
    const schemaBlock = [
      "```json",
      "{",
      '  "type": "object",',
      '  "properties": {',
      '    "sentences": { "type": "array" }',
      "  },",
      '  "required": ["sentences"]',
      "}",
      "```",
    ].join("\n");

    const fixture = [
      "You are NeoDevEx Repo Q&A, a principal engineer assistant.",
      "",
      "Keep output tight and evidence-backed. Please make sure to stay concise.",
      "",
      "TypeScript import snippet:",
      tsImportBlock,
      "",
      "React component:",
      reactBlock,
      "",
      "Shell commands:",
      shellBlock,
      "",
      "Git diff:",
      diffBlock,
      "",
      "Stack trace:",
      stackTraceBlock,
      "",
      "Package scripts:",
      packageScriptsBlock,
      "",
      "Mermaid diagram:",
      mermaidBlock,
      "",
      "JSON schema:",
      schemaBlock,
      "",
      "Question: Why does the review gate fail after validation?",
    ].join("\n");

    const result = compressForPromptWithPolicy({
      context: "repo_investigator_memory",
      path: "/repo-investigator-memory/edge-case-blocks.md",
      text: fixture,
      mode: "full",
      minSavedTokens: 1,
    });

    expect(result.text).toContain(tsImportBlock);
    expect(result.text).toContain(reactBlock);
    expect(result.text).toContain(shellBlock);
    expect(result.text).toContain(diffBlock);
    expect(result.text).toContain(stackTraceBlock);
    expect(result.text).toContain(packageScriptsBlock);
    expect(result.text).toContain(mermaidBlock);
    expect(result.text).toContain(schemaBlock);
    expect(result.text).toContain("Question: Why does the review gate fail after validation?");
    expect(result.text.length).toBeLessThan(fixture.length);
  });
});
