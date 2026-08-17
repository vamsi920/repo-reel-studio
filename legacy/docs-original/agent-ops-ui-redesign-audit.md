# Agent Ops UI — Redesign Audit (pass 01/40)

**Scope:** Information architecture + layout audit for Studio **Agent Ops** and **Proactive** surfaces. No product behavior changes in pass 01 (documentation only).  
**Workspace:** `/Users/vamsi/Desktop/repo-reel-studio`  
**Primary file:** `src/components/studio/AgentRunsPanel.tsx` (~214 lines orchestrator) + `src/components/studio/agent-ops/panel/*`  
**Entry:** `src/pages/Studio.tsx` → workspace view `runs` → `<AgentRunsPanel />`  
**Backend reference:** [proactive-agent-stability-audit.md](./proactive-agent-stability-audit.md) (passes 02–40 complete)

---

## 1. Purpose

Agent Ops is where operators (1) start **issue-driven runs**, (2) review sandbox output, and (3) manage **proactive** daily candidates before any PR opens. The current UI works but grew inside one file with duplicated controls, deep vertical stacking, and uneven discovery of linked-run vs proactive flows.

Pass **01** maps problems, target IA, components, and a **39-step UI checklist** for passes 02–40.

---

## 2. Current layout (as built)

```text
Studio (runs view)
└─ AgentRunsPanel
     ├─ Global hero (metrics + Runs | Proactive tabs + blurb)
     │
     ├─ [Runs tab]  xl:grid [340px aside | main]
     │    ├─ Aside: New Run form + Run Queue (filter + list)
     │    └─ Main: Run header → PipelineBar → metrics → 8 detail tabs
     │         (overview, diff, validation, tests, pr, mission, quality, fixstory)
     │
     └─ [Proactive tab]  xl:grid [340px aside | main]
          ├─ Aside: ProactiveModeCard + static Operator Notes
          └─ Main: ProactiveDashboard (cards grid, max 6)
               + ProactiveLiveConsole (full-width below: log + linked run + validation)
```

**Related components (not in AgentRunsPanel):**

| File | Role |
|------|------|
| `src/lib/agentRuns.ts` | Issue-run API |
| `src/lib/proactiveAgentOps.ts` | Proactive API + normalization |
| `src/lib/proactiveNormalize.ts` | Defensive payload shaping |
| `src/lib/agentOpsPolling.ts` | 2s / backoff poll intervals |
| `src/lib/agentOpsHealth.ts` | Ingestion + proactive backend hints |
| `src/lib/proactiveContextHints.ts` | Manifest/graph → dispatch hints |
| `src/components/studio/MissionMap.tsx` | Run tab “Execution Map” |
| `src/components/studio/FixStoryPreview.tsx` | Run tab “Reviewer Brief” |

---

## 3. Current layout problems

### 3.1 Monolith and maintainability

| Problem | Evidence | Impact |
|---------|----------|--------|
| Single ~3k-line component | All UI + hooks + 25+ child functions in `AgentRunsPanel.tsx` | Hard to review, test, or redesign one lane without regressions |
| Duplicated primitives | `SectionLabel`, `CompactMetric`, `LogBox`, `EmptyState` local to file | Inconsistent reuse vs shared design system |
| Mixed concerns | Polling, API calls, toasts, and presentation in one component | State bugs when extending one workspace |

### 3.2 Information architecture

| Problem | Evidence | Impact |
|---------|----------|--------|
| Two workspaces, one mental model | Tab switch hides entire Runs UI vs Proactive UI | Operators lose run queue context when reviewing proactive candidates |
| Proactive config duplicated | `ProactiveModeCard` (aside) + `ProactiveDashboard` header both have Refresh / Run now / Enable | Conflicting labels (“Run now” vs “Dispatch Today”) |
| Console disconnected from cards | `ProactiveLiveConsole` below dashboard; selection only highlights card | Long scroll; hard to see “selected candidate → log → validation” on laptop heights |
| Backend cap invisible in UI | `candidates.slice(0, 6)` in `ProactiveDashboard` | More than six candidates exist; no “view all” or batch list API in panel |
| Cross-link is one-way | Card “Review run” jumps to Runs tab | Returning to proactive loses scroll/selection context |

### 3.3 Runs workspace

| Problem | Evidence | Impact |
|---------|----------|--------|
| Eight horizontal tabs | `DetailTab` × 8 in one row | Overflow/wrap on smaller widths; unclear priority |
| Composer buried in narrow aside | Issue URL + branch only in 340px column | Main area empty until a run is selected |
| Empty state vs dense state | Large placeholder when no run selected | Wasted horizontal space on xl breakpoints |
| Approve controls in header | Branch + Approve/Reject in run hero | Easy to miss when reading tabs below |

### 3.4 Proactive workspace

| Problem | Evidence | Impact |
|---------|----------|--------|
| Vertical stack depth | Mode card → dashboard → live console | Operator must scroll to see validation output |
| Policy UI repeated | `PolicyVisibilityPanel` on card and again in console column | Noise on cards with many warnings |
| Status vocabulary | `humanizeCandidateStatus` title-cases raw backend strings | `needs_execution` / `executing` / `approved_internal` read awkwardly vs pills |
| Batch progress vs ready count | Metrics mix `status.ready` and `batch.progress` | “Passed Checks” label ambiguous |
| AI typing effect in console | `setInterval` typewriter on latest AI event | Motion distraction; accessibility concern |

### 3.5 Feedback, health, and errors

| Problem | Evidence | Impact |
|---------|----------|--------|
| Backend hints as amber walls | `agentBackendHint` / `proactiveBackendHint` | Good content but no persistent “backend status” strip |
| Toast on proactive dispatch | Generic “dispatch complete” for non-complete paths | Misleading when status is `skipped` / `unchanged` (partially improved) |
| No `storeRecovery` in UI | Backend returns quarantined/degraded store info (pass 37) | Operators don’t see corrupt-file recovery |
| Polling always 2s when active | `computeProactivePollIntervalMs` / runs poll | Acceptable but no visible “last synced” timestamp |

### 3.6 Visual / density

| Problem | Evidence | Impact |
|---------|----------|--------|
| Repeated glass panels | Many `rounded-[20-22px] gf-panel` stacks | Visual sameness; weak hierarchy |
| Small touch targets on cards | Multiple `h-8` buttons in card footer | Cramped approve/dismiss/run/console actions |
| Score prominence over policy | Large score badge vs policy block | Risk signals underweighted for approve decisions |

---

## 4. Target information architecture

### 4.1 Principles

1. **One shell, two lanes** — Shared header (repo context, health, global metrics); lane switch does not reset unrelated state without explicit action.
2. **Inspect without mode switch** — Proactive inspection drawer/split shows linked run summary; deep dive still opens Runs lane.
3. **Progressive disclosure** — Card = decision summary; drawer/console = evidence; Runs = full diff/PR.
4. **Honest backend contracts** — Show “6 shown / N in batch”, `shortfallReason`, `storeRecovery`, policy state, and dispatch mode (skipped/in progress).
5. **Extract components** — Shell, lanes, and shared atoms in `src/components/studio/agent-ops/`.

### 4.2 Target map

```text
AgentOpsShell
├─ AgentOpsHeader
│    ├─ Title + repo context
│    ├─ Global metrics (active runs, review queue, proactive ready/target)
│    ├─ BackendHealthStrip (ingestion + proactive proxy)
│    └─ WorkspaceModeSwitch (Runs | Proactive)
│
├─ RunsWorkspace
│    ├─ RunsSplitLayout
│    │    ├─ RunQueuePanel (search, filters, list)
│    │    └─ RunInspector
│    │         ├─ RunInspectorHeader (status, pipeline, primary actions)
│    │         ├─ RunInspectorMetrics
│    │         └─ RunInspectorTabs (grouped: Output | Validation | Review)
│    └─ IssueRunComposer (collapsible or top bar; not only 340px default)
│
└─ ProactiveWorkspace
     ├─ ProactiveSplitLayout
     │    ├─ ProactiveControlRail (enable, deadline, dispatch, batch phase — once)
     │    ├─ ProactiveCandidateBoard (grid + “show all” when API available)
     │    └─ ProactiveInspectionPanel (console + linked run + policy + validation)
     └─ ProactiveCandidateCard (compact decision card)
```

### 4.3 Grouped run tabs (target)

| Group | Tabs merged |
|-------|-------------|
| **Summary** | overview, fixstory (reviewer brief) |
| **Changes** | diff, mission (execution map) |
| **Verification** | validation, tests, quality |
| **Ship** | pr |

Reduces tab strip from 8 → 4 with optional sub-segments inside panel.

### 4.4 Proactive operator flow (target)

```text
Enable/configure → Dispatch (manual or cron copy) → Scan batch status
  → Pick candidate card → Inspection panel (live log + validation excerpt)
  → Optional: Open full run (Runs lane) → Approve / Dismiss on card
```

---

## 5. Component map (current → target)

| Current (in `AgentRunsPanel.tsx`) | Target module | Notes |
|-----------------------------------|---------------|--------|
| Root state + effects | `agent-ops/useAgentOpsState.ts` | Hooks: runs, proactive, polling, selection |
| Global hero + tabs | `agent-ops/AgentOpsShell.tsx` | Layout only |
| `CompactMetric`, `InlineMeta` | `agent-ops/MetricStrip.tsx` | Shared |
| Runs aside + main | `agent-ops/runs/RunsWorkspace.tsx` | |
| New run form | `agent-ops/runs/IssueRunComposer.tsx` | |
| `RunListItem` | `agent-ops/runs/RunQueueItem.tsx` | |
| Run detail + tabs | `agent-ops/runs/RunInspector.tsx` | Tab groups |
| `PipelineBar` | `agent-ops/runs/RunPipelineBar.tsx` | |
| `ProactiveModeCard` | `agent-ops/proactive/ProactiveControlRail.tsx` | Single control surface |
| `ProactiveDashboard` | `agent-ops/proactive/ProactiveCandidateBoard.tsx` | Drop duplicate header actions |
| `ProactiveCandidateCard` | `agent-ops/proactive/ProactiveCandidateCard.tsx` | |
| `ProactiveLiveConsole` | `agent-ops/proactive/ProactiveInspectionPanel.tsx` | Optional split-pane |
| `PolicyVisibilityPanel` | `agent-ops/shared/PolicyBanner.tsx` | Card vs panel variants |
| `LogBox`, validation blocks | `agent-ops/shared/ValidationOutput.tsx` | Runs + proactive |
| `CandidateStatusPill` | `agent-ops/shared/StatusChip.tsx` | Unified run + candidate statuses |
| `formatProactiveHint` | `agent-ops/shared/backendHints.ts` | |
| — | `agent-ops/shared/ConsoleLog.tsx` | Extract realtime log renderer |

**Keep importing from:** `MissionMap`, `FixStoryPreview`, `@/components/ui/*`, `@/lib/*` APIs unchanged in early passes.

### 5.1 Panel boundaries (pass 34)

| Module | Responsibility | Owns state? |
|--------|----------------|-------------|
| `AgentRunsPanel.tsx` | Default export for `Studio.tsx`; workspace tab + run detail tab; wires hooks → `AgentOpsShell` → lane components | `activeTab`, `workspaceTab` only |
| `panel/types.ts` | `AgentRunsPanelProps`, `SelectedRunView` | — |
| `panel/agentRunsPanelUtils.ts` | `extractGitHubRepoKey` | — |
| `panel/useAgentRunsLane.ts` | Runs list/load/poll refs, composer, selection, run actions, health → agent attention | Runs lane state |
| `panel/useAgentRunsPolling.ts` | 2s/backoff poll loop (refs-only deps, `repoUrl`) | — |
| `panel/AgentRunsPanelRunsLane.tsx` | `RunsWorkspace` layout: composer + queue + inspector slot | — |
| `panel/AgentRunsPanelRunsLaneInspector.tsx` | Empty inspector vs `RunInspectorDetail` | — |
| `panel/RunInspectorDetail.tsx` | Inspector header, pipeline, metrics, all run detail tabs | — |
| `panel/AgentRunsPanelProactiveLane.tsx` | `ProactiveWorkspace` + proactive controller props | — |
| `useAgentOpsProactive.ts` (pass 32) | Proactive load/toggle/dispatch, selection, health merge | Proactive lane state |

**Import contract:** `Studio.tsx` keeps `import AgentRunsPanel from "@/components/studio/AgentRunsPanel"`; re-export `AgentRunsPanelProps` from panel entry unchanged.

### 5.2 Responsive QA (pass 35)

| Width | Token | Checks |
|-------|-------|--------|
| 390px | `AGENT_OPS_RESPONSIVE_VIEWPORTS.mobile` | Shell chrome, proactive cards/grid, composer, tab bar, dashboard header — no horizontal overflow |
| 768px | `.tablet` | Same suite |
| 1280px | `.desktop` | Same suite + xl split layouts activate at 1280 |

Automated: `src/components/studio/agent-ops/shared/agentOpsResponsiveLayout.test.tsx`. Manual: `npm run dev` → `http://localhost:8080/studio?view=runs` (auth required).

### 5.3 Motion & polling UX (pass 36)

| Module | Role |
|--------|------|
| `shared/agentOpsMotion.ts` | `motion-safe` / `motion-reduce` transition, spinner, chevron, fade tokens |
| `shared/AgentOpsSpinner.tsx` | Shared Loader2 wrapper (user-initiated busy only) |
| `shared/AgentOpsOperationStrip.tsx` | Opacity fade; mutate = spinner, neutral = static dot; no background poll copy |
| `lib/agentOpsOperations.ts` | Strip shows load + user mutations only (no sync/poll descriptors) |
| `useAgentOpsProactive.ts` / `useAgentRunsPolling.ts` | Poll `loadProactive({ silent: true })` — skips syncing UI flags |

### 5.4 Content density (pass 37)

| Surface | Top (always visible) | Progressive disclosure |
|---------|----------------------|-------------------------|
| **Runs inspector** | Header + approval bar; fact chips → tabs; pipeline | Tabs: Summary, Patch, Checks (validation/tests/gates), Ship (PR+brief), Map |
| **Proactive inspection** | Policy banner; fact chips | Tabs: Overview (hypothesis, evidence, run meta), Checks (validation/files/tests/gates), Log |
| **Proactive board** | Ready/batch/passed inline metrics | `details` batch breakdown |
| **Mode rail** | Enable + dispatch (studio chrome, not nested panel) | — |

Critical approval, policy, and validation stay on fact strip + Checks/Ship tabs.

### 5.5 Final responsive QA (pass 38)

| Width | Method | Result |
|-------|--------|--------|
| 320px | `agentOpsResponsiveLayout.test.tsx` (`AGENT_OPS_FINAL_QA_WIDTHS`) | No horizontal overflow on shell, tabs, fact strips, cards, composer, headers, proactive detail |
| 390px | Same automated suite | Pass |
| 768px | Same | Pass |
| 1024px | Same | Pass |
| 1440px | Same | Pass |

**Fixes applied (pass 38):**

- `AgentOpsPanel` `variant="nested"` for composer, queue, dashboard (reduces stacked `gf-panel` shadow clutter); inspector/detail remain `surface`.
- Fact strips: horizontal scroll on `<sm`, abbreviated chip labels, `sm` wrap.
- Tab triggers: smaller `min-width` / padding below `sm`.
- Approval row: full-width `min-w-0` buttons on narrow screens.
- Status headline: `line-clamp-2` + `text-xs` on mobile.
- Proactive inspection header: stacks open-run action under title on narrow viewports.

**Manual (optional):** `npm run dev` → `http://localhost:8080/studio?view=runs` (signed in) — DevTools device widths 320 / 390 / 768 / 1024 / 1440.

**Browser MCP note:** prior pass could not mount React in embedded browser; pass 38 verification is jsdom layout metrics + code inspection.

---

## 6. UI implementation checklist (39 steps, passes 02–40)

Pass **01** = this document only. Passes **02–40** execute UI work; order is suggested.

### Foundation & extraction (1–8)

| # | Task | Pass |
|---|------|------|
| 1 | Create `src/components/studio/agent-ops/` directory and `AgentOpsShell` with header + mode tabs only | 02 |
| 2 | Extract `useAgentOpsState` (runs load/select, proactive load, polling) from `AgentRunsPanel` | 02 |
| 3 | Move shared atoms: `SectionLabel`, `MetricStrip`, `StatusChip`, `EmptyState` | 03 |
| 4 | Wire `Studio.tsx` to `AgentOpsShell`; keep `AgentRunsPanel` as thin re-export during migration | 03 |
| 5 | Add `BackendHealthStrip` using `fetchIngestionHealth` + proactive hint resolution | 04 |
| 6 | Display `storeRecovery` + `shortfallReason` in proactive header when present | 04 |
| 7 | Add “last synced” indicator tied to poll runner | 05 |
| 8 | Document component map in Storybook or `agent-ops/README.md` (dev-only) | 05 |

### Runs lane (9–18)

| # | Task | Pass |
|---|------|------|
| 9 | `RunsWorkspace` split layout; preserve 340px queue / flex inspector | 06 |
| 10 | `IssueRunComposer` — optional top placement on lg+; keep aside fallback | 06 |
| 11 | `RunQueuePanel` — status filter chips (active / review / terminal) | 07 |
| 12 | `RunInspector` header — sticky primary actions (approve/reject/cancel) | 07 |
| 13 | Collapse 8 tabs → 4 groups with sub-navigation | 08 |
| 14 | Empty inspector: compact CTA + link to composer | 08 |
| 15 | `ValidationOutput` shared component from run validation tab | 09 |
| 16 | Improve mobile: queue full width; inspector stacked | 09 |
| 17 | Keyboard: queue ↑/↓ changes selection | 10 |
| 18 | Run inspector loading skeletons | 10 |

### Proactive lane (19–28)

| # | Task | Pass |
|---|------|------|
| 19 | `ProactiveControlRail` — single enable/dispatch/refresh; remove duplicate dashboard actions | 11 |
| 20 | Unify button copy: “Run scan” / “Scanning…” everywhere | 11 |
| 21 | `ProactiveCandidateBoard` — card grid + batch progress bar | 12 |
| 22 | Show “Showing 6 of N” when `listProactiveCandidates` or batch count available | 12 |
| 23 | `ProactiveInspectionPanel` — side-by-side with grid on xl (console right) | 13 |
| 24 | Policy on card: icon + summary only; full `PolicyBanner` in inspection panel | 13 |
| 25 | `StatusChip` map for all `ProactiveCandidateStatus` + failure kinds | 14 |
| 26 | Dispatch toasts: distinct copy for `skipped`, `unchanged`, `in_progress` | 14 |
| 27 | Optional: disable typewriter; prefer instant log append | 15 |
| 28 | Approve button states: blocked / review-only / promote (match backend) | 15 |

### Cross-lane & polish (29–35)

| # | Task | Pass |
|---|------|------|
| 29 | “Open in Runs” preserves proactive selection when returning (tab memory) | 16 |
| 30 | Highlight run in queue when opened from proactive `runId` | 16 |
| 31 | Shared `ConsoleLog` for run timeline + proactive events | 17 |
| 32 | Reduce duplicate `gf-panel` nesting (max 2 depths per view) | 17 |
| 33 | Focus management: inspection panel receives focus on card select | 18 |
| 34 | `prefers-reduced-motion` for spinners and log animations | 18 |
| 35 | aria-live region for proactive batch phase changes | 19 |

### Verification & sign-off (36–39)

| # | Task | Pass |
|---|------|------|
| 36 | Vitest: extract pure helpers (`formatProactiveHint`, status labels) | 19 |
| 37 | Visual QA checklist (1280 / 1440 / 1920 widths) | 20 |
| 38 | `npm run test:proactive:client` + manual Studio smoke with `dev:with-agent` | 20 |
| 39 | Pass 40: update this doc §7 with sign-off + residual UI risks | 40 |

---

## 7. Pass 40 sign-off (completed 2026-05-28)

| Check | Expected | Result |
|-------|----------|--------|
| `AgentRunsPanel.tsx` | Thin shell or removed; logic in `agent-ops/` | ✅ Thin shell orchestrator; lane logic in `agent-ops/panel/*` |
| No duplicate proactive dispatch controls | Single control rail | ✅ Single control rail retained |
| Runs tab count | ≤4 top-level groups | ⚠ Final uses 5 focused tabs (`summary`, `patch`, `checks`, `ship`, `map`); accepted to keep mission map discoverable |
| Proactive xl layout | Board + inspection visible without long scroll | ✅ Responsive suites pass 320–1440 with nested/surface panel variants |
| Backend contract | shortfall + policy + recovery visible when API sends them | ✅ Regression audit covers policy/error/console paths; backend attention + checks render |

Verification bundle used for final sign-off:

```bash
npm test -- --run src/components/studio/agent-ops/agentOpsRegressionAudit.test.tsx src/components/studio/agent-ops/shared/agentOpsResponsiveLayout.test.tsx
npm run build
python3 -m compileall server
```

Note: compileall failed only in generated sandbox artifact under `server/.agent-runs/*`; source compile re-run excluding hidden runtime directories passed (`OK compiled 99 files`).

---

## 8. Pass log

| Pass | Date | Outcome |
|------|------|---------|
| 01/40 | 2026-05-27 | UI redesign audit doc (this file) |
| 02/40 | 2026-05-27 | `AgentOpsShell`, `RunsWorkspace`, `ProactiveWorkspace`, shared atoms; xl proactive board + inspection split |
| 03/40 | 2026-05-27 | Header: segmented mode switch, single primary status, no marketing copy |
| 04/40 | 2026-05-27 | `WorkspaceModeSwitch`: a11y tablist, keyboard nav, always-on counts, tabpanel ids |
| 05/40 | 2026-05-27 | Compact `IssueRunComposer`: inline stats, form submit, clear error/empty states |
| 06/40 | 2026-05-27 | `RunQueuePanel` / `RunQueueItem`: flat divided list, truncate at 320px |
| 07/40 | 2026-05-27 | `RunInspectorHeader`: compact title, meta chips, approval bar, loading states |
| 08/40 | 2026-05-27 | `RunInspectorProgress` + `runPipeline.ts`: compact pipeline row, facts line |
| 09/40 | 2026-05-27 | `RunInspectorTabBar`: scrollable tabs, sentence case labels, a11y tablist |
| 10/40 | 2026-05-27 | `RunSummaryTab`: review-document layout, null-safe sections |
| 11/40 | 2026-05-27 | `RunPatchTab`: bounded scroll, monospace diff, empty/loading copy |
| 12/40 | 2026-05-27 | `RunValidationTab`: divided command accordion, subtle fail styling |
| 13/40 | 2026-05-27 | `TestMatrixView` / `QualityGatesView` + shared `MetricPill`, `TabEmpty` |
| 14/40 | 2026-05-27 | `RunPrTab` / `RunReviewerBriefTab` + `PrPublicationStatusBar` |
| 15/40 | 2026-05-27 | `ProactiveModeCard` redesign; `proactiveHints` shared helper |
| 16/40 | 2026-05-27 | `ProactiveDashboardHeader` operational metrics; compact empty states |
| 17/40 | 2026-05-27 | `ProactiveCandidateCard` compact layout; display helpers extracted |
| 18/40 | 2026-05-27 | `ProactiveCandidateDetail` flat sections; replaces nested console cards |
| 19/40 | 2026-05-27 | `ProactiveLiveConsole` grouped event stream + validation snippets |
| 20/40 | 2026-05-27 | `AgentOpsAttentionPanel` + `agentOpsAttention` for backend errors |
| 21/40 | 2026-05-27 | `AgentOpsOperationStrip` + labeled loading for runs/proactive ops |
| 22/40 | 2026-05-27 | `AgentOpsEmptyState` actionable empties across runs + proactive |
| 23/40 | 2026-05-27 | Responsive layout: `agentOpsLayout` tokens; mobile/tablet/desktop splits; overflow + tap targets |
| 24/40 | 2026-05-27 | Accessibility: radiogroup candidates, focus rings, status `aria-label`s, button names |
| 25/40 | 2026-05-27 | Visual noise: shared surfaces/metrics, removed operator notes, Studio-aligned panel tokens |
| 26/40 | 2026-05-27 | Unified run + proactive status/type badges; unknown statuses degrade with dashed neutral |
| 27/40 | 2026-05-27 | Action grouping: `AgentOpsActionButton` intents, disabled copy, demoted duplicate dispatch |
| 28/40 | 2026-05-27 | Operational copy via `agentOpsCopy`; proactive internal-only / no PR until approve |
| 29/40 | 2026-05-27 | VRT-stable dimensions (`agentOpsDimensions`, `AgentOpsStableLabel`); fixed row/card/tab/console/code/metric heights |
| 30/40 | 2026-05-27 | Studio embed: `agentOpsStudioSectionClass` (680px floor), compact chrome (no duplicate Agent Ops h1), `#studio-agent-ops` wrapper |
| 31/40 | 2026-05-27 | Deterministic helper + RTL tests: `agentRunsPanelHelpers`, `proactiveHints`, empty states, workspace ready/selection UI |
| 32/40 | 2026-05-27 | Proactive flow hook + mocked interaction tests; dismiss selection + health attention merge fixes |
| 33/40 | 2026-05-27 | Perf: poll refs + equality guards, silent poll skips sync churn, memo queue/candidate list |
| 34/40 | 2026-05-27 | Split `AgentRunsPanel` into `agent-ops/panel/*` (lane hooks, runs/proactive lanes, `RunInspectorDetail`); shell ~214 LOC; `npm run build` green |
| 35/40 | 2026-05-28 | Responsive QA: 390 / 768 / 1280px overflow tests (`agentOpsResponsiveLayout.test.tsx`); mobile fixes (shell header, candidate card chips/actions, section header stack, badge truncate, tab padding); browser MCP could not mount React — jsdom harness used |
| 36/40 | 2026-05-28 | Motion polish: `agentOpsMotion` tokens + `AgentOpsSpinner`; `prefers-reduced-motion` on transitions/spinners; static busy dot (no pulse); operation strip opacity fade; background poll uses `{ silent: true }` — no sync/poll labels in strip |
| 37/40 | 2026-05-28 | Density: single run inspector shell; 5 grouped tabs + fact strip; proactive inspection tabs (Overview/Checks/Log) + disclosures; compact dashboard metrics; lighter mode rail chrome |
| 38/40 | 2026-05-28 | Final responsive QA: 320–1440px jsdom overflow suite; nested panel variant; fact-strip scroll + short labels; tab/button clipping fixes |
| 39/40 | 2026-05-28 | Final regression audit: Runs flow, Proactive flow, selected run details, candidate cards, live console, approval actions, backend error states; added `agentOpsRegressionAudit.test.tsx` (9 tests); fixed low-risk regression assertions + proactive fixture typing; `npm test -- --run src/components/studio/agent-ops` + `npm run build` green |
| 40/40 | 2026-05-28 | Final handoff audit: checked diffs for secret patterns/unrelated-change scope; verified no broken imports/dead UI paths via focused tests + build; backend Python syntax compiled (excluding generated hidden runtime sandboxes); completed §7 sign-off + updated residual risks |

---

## 9. Residual UI risks (final)

| ID | Risk | Current status / follow-up |
|----|------|----------------------------|
| U1 | Split refactor breaks polling/selection | Mitigated: lane hooks + regression suite pass |
| U2 | Six-candidate cap can hide backlog depth | Open: still `slice(0, 6)`; add “Showing 6 of N” when batch total exists |
| U3 | Status label drift vs backend enums | Mitigated: shared status mappers + status tests |
| U4 | Mobile proactive console crowding under dense logs | Mitigated for current breakpoints; keep visual QA on new log row fields |
| U5 | Approval copy drift vs backend `approved_internal` semantics | Mitigated in UI copy; keep backend contract tests in CI |
| U6 | Accessibility regressions in keyboard selection/tabs | Mitigated with RTL coverage; keep a11y smoke in future passes |
| U7 | Branch-wide unrelated edits increase handoff noise | Open: large non-Agent-Ops diff remains; isolate/stage Agent Ops files before release PR |

---

## 10. Pass 01 verification

Docs-only — no servers required:

```bash
test -f docs/agent-ops-ui-redesign-audit.md
wc -l docs/agent-ops-ui-redesign-audit.md
rg -n "ProactiveDashboard|ProactiveLiveConsole|AgentRunsPanel" src/components/studio/AgentRunsPanel.tsx | head
```

Optional UI smoke (requires backends — **stop when done**):

```bash
npm run dev:with-agent
# open Studio → Agent Ops → exercise Runs + Proactive tabs
# stop: pkill -f "vite|uvicorn|ingestion-server|agent_runs"
```

---

## 11. Relation to backend stability program

| Backend pass | UI follow-up (this program) |
|--------------|-----------------------------|
| 16 status summary | Header metrics + shortfall strip (#6) |
| 32 policy visibility | PolicyBanner placement (#24) |
| 35 cron story | Control rail copy + deadline (#19–20) |
| 37 failure recovery | `storeRecovery` display (#6) |
| 38 verify gate | #38 reuse `npm run test:proactive:client` |

Backend gate: `npm run verify:proactive` (see proactive stability audit §11.35).
