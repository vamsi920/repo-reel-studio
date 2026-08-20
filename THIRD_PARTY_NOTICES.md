# Third-Party Notices

This file records third-party source code vendored into this repository,
per its license terms.

## Understand-Anything (`vendor/understand-anything/`)

- **Upstream repository**: https://github.com/Egonex-AI/Understand-Anything
- **Upstream commit SHA**: `32944829e7a63a9fa9c55d811d7f98a9530c6a6a`
- **License**: MIT (full text preserved at `vendor/understand-anything/LICENSE`)
- **Copyright**: (c) 2026 Yuxiang Lin; (c) 2026 Infinite Universe, Inc.
  Upstream's root LICENSE names **two** holders — both notices are retained
  verbatim.
- **What was vendored**: two subsets, powering the Interactive CodeGraph
  (Knowledge → CodeGraph).
  - `core/` — from `understand-anything-plugin/packages/core/src`: the
    tree-sitter analysis path (`plugins/`, `languages/`, `analyzer/`), graph
    types/schema, Fuse search, and the commit-keyed fingerprint/staleness
    logic. Runs in Node, inside the agent-server sandbox.
  - `dashboard/` — from `understand-anything-plugin/packages/dashboard/src`:
    the React Flow node components (`CustomNode`, `ContainerNode`, `PortalNode`,
    `LayerClusterNode`, `NodeTooltip`) and the layout/aggregation utilities
    (`elk-layout`, `containers`, `louvain`, `edgeAggregation`, `layerStats`).
    Runs in the browser.
- **What was intentionally excluded**: upstream's Zustand store, its seven
  bundled locales, and the Figma / knowledge-wiki / domain / tour / persona /
  export / mobile surfaces; `analyzer/llm-analyzer.ts` and `tour-generator.ts`
  (NeoDevEx sources node prose from its existing DeepWiki Knowledge pages
  rather than prompting an LLM a second time); and `embedding-search.ts`.
- **Licensing is not uniform upstream — verify per directory before vendoring
  more.** Two nested cases were found and both were excluded from this drop:
  - `packages/tree-sitter-swift-wasm/LICENSE` is a *separate* MIT notice
    (Copyright (c) 2021 alex-pinkus) covering a third-party tree-sitter grammar.
  - `packages/tree-sitter-dart-wasm` ships a prebuilt third-party grammar with
    **no license file at all**.

  Accordingly, Swift and Dart language support was removed from the vendored
  set (their `languages/configs/*` and `plugins/extractors/*` entries). Do not
  reinstate the Dart grammar until its licensing is resolved upstream.
- **Local modifications**: import specifiers rewritten for this repo's
  `moduleResolution: "bundler"`; upstream's `I18nContext` and `LayerLegend`
  palette replaced by small NeoDevEx shims (`dashboard/i18n-shim.tsx`,
  `dashboard/layer-palette.ts`); upstream's already-deprecated
  `applyDagreLayout` and its `@dagrejs/dagre` import removed from
  `dashboard/utils/layout.ts`; upstream tests not vendored. No upstream logic
  was rewritten. Full detail in `vendor/understand-anything/README.md`.
- **How to update**: follow the step-by-step procedure in
  `vendor/understand-anything/README.md` ("How to update"), then update the
  commit SHA above.

## DeepWiki-Open (`vendor/deepwiki-open/`)

- **Upstream repository**: https://github.com/AsyncFuncAI/deepwiki-open
- **Upstream commit SHA**: `c6bea82b68d47fd81f514e96025de90698030708`
- **License**: MIT (full text preserved at `vendor/deepwiki-open/LICENSE`)
- **Copyright**: (c) 2024 Sheing Ng
- **What was vendored**: only the `api/` directory (the FastAPI repository-
  understanding backend — repo ingestion, RAG/embeddings, wiki structure and
  page generation, Mermaid diagram generation). The upstream repo's Next.js
  frontend was intentionally not vendored — NeoDevEx implements its own
  Knowledge UI (`/kt` routes) rather than reusing DeepWiki's own frontend.
- **Local modifications**: four bug fixes, all documented with full root
  cause in `docs/deepwiki-video-kt-integration.md`:
  - §3.1 — `_determine_structure`'s file list was interpolated as a raw
    Python list repr instead of a real newline-separated tree.
  - §3.2 — `config.py`'s directory-exclusion matching missed
    version-suffixed virtualenv names (e.g. `.venv313`), letting thousands
    of third-party library files pollute the RAG index and prompts.
  - §3.3 — `_generate_page` never actually read the source files it
    declared as a page's context, so generated pages paraphrased README
    prose instead of citing real code.
  - §3.4 — no `max_output_tokens` cap and `temperature: 1.0` let a known
    LLM degenerate-repetition failure mode produce pages over 1M characters,
    corrupting markdown tables and Mermaid blocks.
  Otherwise integrated entirely through DeepWiki's own public HTTP API
  (`POST /wiki/tasks`, `GET /wiki/tasks/{id}`, `GET /wiki/tasks/{id}/stream`)
  using its existing `type: "local"` repository mode.
- **How to update**: re-download the `api/` directory from a newer upstream
  commit, replace `vendor/deepwiki-open/api/`, then reapply the fixes
  described in §§3.1-3.4 of the integration doc (check first whether
  upstream has since
  fixed it themselves).

## AgentOps (`vendor/agentops/`)

- **Upstream repository**: https://github.com/AgentOps-AI/agentops
- **Upstream commit SHA**: `f8e907b92dabe47232978023fdcb01e2a7d4b752`
- **License**: MIT (full text preserved at `vendor/agentops/LICENSE`)
- **Copyright**: (c) 2023 AgentOps-AI
- **What was vendored**: only `agentops/semconv/` — the semantic-convention
  *vocabulary* (span kinds and attribute names, aligned with the OpenTelemetry
  GenAI conventions), ported from Python to ESM JavaScript under
  `vendor/agentops/semconv/`. It is the schema NeoDevEx's AgentOps Control
  Tower emits spans in. These files contain no behavior, only names.
- **Licensing is not uniform upstream — verify per directory before vendoring
  more.** The root `LICENSE` (MIT) covers the `agentops/` Python SDK. The
  entire `app/` tree — the AgentOps **dashboard**, its FastAPI backend, its
  OpenTelemetry collector, the landing site, and the ClickHouse/Supabase
  pieces — is licensed under the **Elastic License 2.0** (`app/LICENSE`), a
  source-available license that prohibits offering the software as a hosted or
  managed service to third parties. **Nothing from `app/` was vendored, and
  nothing from it may be.** NeoDevEx's run-timeline and span-inspector UI
  (`src/components/features/agentops/`) was written from scratch against the
  *concept* of AgentOps session replay; no ELv2 code, markup, or styling was
  copied.
- **What was intentionally excluded**: all of `app/` (ELv2, above); the
  AgentOps SDK client, exporters, and `agentops/instrumentation/`
  auto-instrumentors — NeoDevEx's agent runtime is an external, unmodified
  OpenHands agent-server that already reports per-LLM-call token, cost and
  latency metrics, so running the SDK inside it would instrument every LLM call
  twice; `semconv/message.py` (per-message prompt/completion *content*
  attributes — the Control Tower stores actions, tool calls, outputs and
  summaries, never conversation content or chain-of-thought); and
  `semconv/langchain.py`, `semconv/meters.py`, `semconv/resource.py` (no
  LangChain, no OTel meter pipeline, no host-resource collection here).
- **Local modifications**: Python → ESM JavaScript port (attribute classes and
  `Enum` subclasses become `Object.freeze({...})` constants) with **every
  attribute string value kept verbatim**, so the wire vocabulary is unchanged;
  `snake_case.py` filenames became `kebab-case.mjs`; the deprecated legacy `SpanKind` back-compat class in
  `span_kinds.py` was dropped; `AgentAttributes.AGENT_REASONING` was
  deliberately not ported because NeoDevEx never persists agent
  chain-of-thought; `span_attributes.py` and `workflow.py` were reduced to the
  attributes NeoDevEx has a real source for. No upstream logic was ported or
  rewritten. Full detail in `vendor/agentops/README.md`.
- **How to update**: follow the step-by-step procedure in
  `vendor/agentops/README.md` ("How to update") — in particular, re-verify
  `app/LICENSE` before taking anything new — then update the commit SHA above.

## Layman (`src/lib/layman/`)

- **Upstream repository**: https://github.com/vamsi920/layman
- **Upstream commit SHA**: `76ec6347a09e6480c8a23a6c8879729ffdc13a43`
- **License**: MIT
- **Copyright**: (c) 2026 Julius Brussee

  Layman is a fork/evolution of Caveman. Its root `LICENSE` is a single MIT
  notice covering the whole repository; the compression engine has no nested
  or differing license.
- **What was vendored**: the deterministic compression engine only —
  upstream's `layman-compress/scripts/{compress,detect,validate}.py`
  (sensitive-path refusal, markdown segmentation, the protected-token pass,
  token estimation, and the post-compression validator), as the TypeScript
  port already carried in this repository at
  `legacy/src/lib/laymanCompression{Core,Policy}.ts`. It powers workspace
  memory context compression (`src/lib/workspace-memory/`).
  - `compression-core.ts` — segmentation, protection, compression, validation,
    token estimation. Dependency-free.
  - `compression-policy.ts` — per-context enable/deny policy, the integration
    safety boundary, and rollback instrumentation.
  - `index.ts` — a NeoDevEx barrel; the vendored files are not imported
    directly from outside this directory.
- **What was intentionally excluded**: everything that is a prompt package
  rather than a compression engine — the Layman/Caveman skills, slash
  commands, rules, hooks, editor integrations (`.cursor`, `.windsurf`,
  `.clinerules`, copilot instructions), evals, and benchmarks. Also excluded:
  upstream's LLM-backed compression path (`call_claude`,
  `build_compress_prompt`, `build_fix_prompt`) and its on-disk file rewriting
  with `.original` backups. NeoDevEx compresses **in memory only**, never
  mutates a file, and never makes a model call to compress — enforced by
  `getLaymanIntegrationSafetyPolicy()` in `compression-policy.ts`.
- **Local modifications**: upstream Python reimplemented in TypeScript
  (deterministic rules only, per the exclusions above); import specifiers
  rewritten for this repo's path aliases; the `LAYMAN_PROMPT_ENABLED` env flag
  replaced by an in-module default that
  `configureLaymanCompressionPolicy()` overrides; one compression context
  (`workspace_memory_context`) added to the policy's context union. No
  upstream compression or validation rule was changed — the preservation
  guarantees (code fences, inline code, URLs, file paths, commands, headings,
  tables, line numbers) are upstream's and are covered by the ported tests in
  `src/lib/layman/*.test.ts`.
- **How to update**: re-read upstream `layman-compress/scripts/` for rule
  changes, mirror them into `compression-core.ts`, run
  `npx vitest run src/lib/layman`, then update the commit SHA above.
