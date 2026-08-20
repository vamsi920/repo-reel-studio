# Understand-Anything (vendored)

Upstream: https://github.com/Egonex-AI/Understand-Anything
Commit: `32944829e7a63a9fa9c55d811d7f98a9530c6a6a`
License: MIT — see `LICENSE` (two copyright holders, both retained)

This is a **partial** vendor drop. It powers NeoDevEx's Interactive CodeGraph
(Knowledge → CodeGraph). See `docs/codegraph.md` for the integration design and
`THIRD_PARTY_NOTICES.md` for the formal notice.

## Layout

| Path         | Upstream origin                              | Runs where |
| ------------ | -------------------------------------------- | ---------- |
| `core/`      | `understand-anything-plugin/packages/core/src`      | analyzer (Node, in the agent-server sandbox) + shared types in the browser |
| `dashboard/` | `understand-anything-plugin/packages/dashboard/src` | browser (React Flow rendering) |

## What was intentionally NOT vendored

- `dashboard/src/store.ts` — upstream's Zustand store also models tours,
  personas, i18n, Figma and diff mode. NeoDevEx drives the same components from
  its own slim `src/stores/codegraph-store.ts` instead.
- `dashboard/src/locales/*` (7 locales) — NeoDevEx has its own react-i18next
  stack; see `dashboard/i18n-shim.tsx`.
- Figma / knowledge-wiki / domain / tour / persona / export / mobile surfaces
  (`DomainGraphView`, `KnowledgeGraphView`, `LearnPanel`, `PathFinderModal`,
  `ExportMenu`, `TokenGate`, `Mobile*`, `ProjectOverview`, `ThemePicker`).
- `core/src/analyzer/llm-analyzer.ts` and `tour-generator.ts` — NeoDevEx sources
  node prose from its existing DeepWiki Knowledge pages instead of prompting an
  LLM a second time.
- `core/src/embedding-search.ts`, `figma/`.
- The `tree-sitter-dart-wasm` and `tree-sitter-swift-wasm` workspace packages,
  and their language configs/extractors — see the licensing note below.

## Licensing notes (read before vendoring more)

Upstream is **not** uniformly licensed, so per-directory verification is
required rather than assuming the root LICENSE covers everything:

- Root `LICENSE` is MIT with **two** holders: Yuxiang Lin, and
  Infinite Universe, Inc. Both notices are preserved verbatim in `LICENSE`.
- `packages/tree-sitter-swift-wasm/LICENSE` is a **different** MIT notice
  (Copyright (c) 2021 alex-pinkus) covering a vendored tree-sitter grammar.
- `packages/tree-sitter-dart-wasm` ships a prebuilt third-party grammar with
  **no license file at all**.

Because of the above, Dart and Swift support was dropped from this drop
(`languages/configs/{dart,swift}.ts`, `plugins/extractors/{dart,swift}-extractor.ts`
and their registry entries). If either is reinstated later, vendor the matching
grammar package and record its own notice; do not ship the Dart grammar until
its licensing is resolved upstream.

## NeoDevEx modifications

All modifications are additive or subtractive — no upstream logic was rewritten.

1. **Import specifiers.** `.js` extensions were stripped from relative imports
   and `@understand-anything/core/*` was rewritten to relative paths, so the
   files resolve under this repo's `moduleResolution: "bundler"`.
2. **`dashboard/i18n-shim.tsx`** (new) replaces upstream's
   `contexts/I18nContext.tsx`, exposing the same `useI18n()` signature over the
   two strings the vendored node components actually read.
3. **`dashboard/layer-palette.ts`** (new) extracts `LAYER_PALETTE` /
   `getLayerColor` from upstream's `components/LayerLegend.tsx` so the node
   components keep upstream colors without importing upstream's store.
4. **`dashboard/utils/layout.ts`** — upstream's already-deprecated
   `applyDagreLayout` and its `@dagrejs/dagre` import were removed. Upstream
   routes every structural view through ELK; the constants and ELK helpers that
   `elk-layout.ts` imports are untouched.
5. Upstream `__tests__/` directories and `*.test.ts` files were not vendored.

## How to update

1. Re-clone upstream at the new commit.
2. Re-copy the files listed under **Layout** above, excluding the
   **NOT vendored** set.
3. Re-apply modifications 1, 4 and 5 (2 and 3 are NeoDevEx-authored files that
   only need checking if upstream changes `useI18n`'s shape or the palette).
4. Update the commit SHA here and in `THIRD_PARTY_NOTICES.md`.
5. Re-verify licensing for anything newly added — see the notes above.
