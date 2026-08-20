# Supabase data platform: current state

This document is the inspection deliverable required before/alongside the Supabase integration (see the approved plan for the full migration order). It records what existed before this integration landed, so the design decisions in the schema and interface layer are traceable rather than assumed.

## 1. Purpose and scope

The current app (`src/`) is a React Router v7 SPA built with `ssr: false` — a pure static bundle with **no application backend of its own**, except one small Node sidecar (`scripts/agentops-server.mjs`). Supabase is not replacing an existing integration in `src/`; it is genuinely greenfield here. The only prior Supabase code in this repository lives under `legacy/`, a retired sibling app, and is a reference for patterns and mistakes to avoid, not something this integration extends.

## 2. External services inventory

| Service | Owns | Where its state lives today | Frontend adapter |
|---|---|---|---|
| Agent Server | Conversations, workspace list, secrets, settings, profiles | External package/Docker image (`openhands-agent-server`); `workspace/.openhands/workspaces.json` | `@openhands/typescript-client` SDK, `src/api/workspaces-service/`, `src/api/settings-service/`, `src/api/secrets-service.ts`, `src/api/profiles-service/` |
| Automation Server | `Automation` / `AutomationRun` records | External pip package (`openhands-automation`); its own SQLite/Postgres via `AUTOMATION_DB_URL` | `src/api/automation-service/automation-service.api.ts` (axios, `X-Session-API-Key`) |
| DeepWiki | Generated wiki/knowledge pages | Vendored Python FastAPI (`vendor/deepwiki-open/api/`), own process, `~/.adalflow/*` local storage | `src/lib/knowledge/knowledge-engine.ts` (`DeepWikiKnowledgeEngine`), normalizes into NeoDevEx's own types |
| understand-anything (CodeGraph) | Code graph analysis | Vendored analyzer (`vendor/understand-anything/core/`), runs in the agent sandbox; NeoDevEx's own sharded output at `.neodevex/codegraph/out/<commitSha>/` | `src/lib/codegraph/*`, `src/stores/codegraph-store.ts` (in-memory only, pre-integration) |
| AgentOps Control Tower | Run/span/audit/approval/policy telemetry | `scripts/agentops-server.mjs` (the one backend process this repo builds and deploys), append-only JSONL under `~/.neodevex/agentops/*` | `src/api/agentops-service/agentops-service.api.ts` (fetch, direct to sidecar) |

## 3. Per-feature persistence audit (pre-integration)

- **Workspace Memory** — the most rigorously built subsystem before this integration: localStorage as synchronous source of truth for reads (`workspace-memory-store.api.ts`), a durable mirror written into the agent's sandbox filesystem (`workspace-memory-file.api.ts`, `.neodevex/memory/records.jsonl`). Isolation is enforced by `src/lib/workspace-memory/isolation.test.ts` — every accessor requires an explicit `workspaceId`, no "current workspace" default.
- **AgentOps** — append-only JSONL (`runs.jsonl`, `spans/<runId>.jsonl`, `audit.jsonl`, `approvals.jsonl`) plus an atomically-rewritten `policies.json`, all under `~/.neodevex/agentops/`. Tamper-evident and zero-setup by design; reasoning/thinking content is stripped before a span is ever created (`scripts/agentops/map-events.mjs`).
- **Knowledge / CodeGraph** — both explicitly flagged in code as having "no database to persist to" (`src/stores/knowledge-store.ts`, `src/stores/codegraph-store.ts` — both Zustand, in-memory only, lost on reload before this integration).
- **Video KT** — a deterministic (non-AI) manifest builder (`src/lib/kt-video/build-manifest.ts`) rendered live in-browser via Remotion; no MP4 is produced, no manifest was persisted anywhere before this integration.
- **Automations / Proactivation** — real, backed by the external Automation Server. Proactivation's config was (and remains) smuggled into `Automation.prompt` as an HTML comment marker, parsed by `src/utils/proactivation-prompt.ts` — described in its own design doc as "no backend/schema changes."
- **Usage / cost** — three to four disconnected models before this integration: AgentOps `policies.json` budgets, `AutomationRun.cost` (nullable, unaggregated), live per-conversation cost/token metrics (ephemeral, agent-server pass-through), and workspace-memory "savings" metrics.
- **Auth** — local mode: a shared `X-Session-API-Key` header between browser and agent-server, no user identity. Cloud mode: OpenHands Cloud's own OAuth device-flow, `orgId` pass-through only, no local org table.
- **SME, Requirements** — no UI, no routes, no data model anywhere in `src/`. Only exist in the retired `legacy/` app.

## 4. Legacy Supabase schema retrospective

`legacy/` had a working, if drifted, Supabase integration. Lessons this integration deliberately avoids repeating:

- **No formal migrations.** All schema was hand-run SQL pasted into the Supabase SQL editor (`legacy/supabase-schema.sql`, `legacy/supabase-migration.sql`, `legacy/supabase-graph-migration.sql`, `legacy/supabase-env-overrides-migration.sql`, `legacy/supabase-storage-migration.sql`). Several actively-used tables (`project_memory_entries`, `sme_reviews`, `sme_documents`, `token_savings_events`, `onboarding_sessions`, `agent_runs`, `llm_cache`) had **no committed schema at all** — it had to be reverse-engineered from application code.
- **RLS didn't match the real auth model.** `legacy/supabase-schema.sql`'s policies reference `auth.uid() = user_id`, but `legacy/src/lib/supabaseClient.ts` and `AuthContext.tsx` show there was never real per-user auth — every row belonged to one fixed `GLOBAL_USER_ID`. The RLS was vestigial.
- **`project_env_overrides` used `USING (true)` — fully permissive RLS**, relying entirely on the service-role key bypassing it for actual protection.
- **Storage buckets (`project-audio`, `project-graphs`) were public**, with only convention (not policy) enforcing per-project path scoping.
- **`token_savings_daily` was an apparent rollup that was actually a manually maintained table**, not a real view or scheduled refresh — a source of drift.

This integration's schema uses versioned `supabase/migrations/`, RLS built on two `SECURITY DEFINER` helper functions tied to real membership tables, and private Storage buckets gated by the same helpers.

## 5. Constraints this pass respects

Decided with the user before implementation:

1. **Auth**: new, independent Supabase Auth for workspace-collaboration features, running alongside — not replacing — the existing agent-server API-key auth and OpenHands Cloud OAuth. No JWT bridging this pass.
2. **Privileged/service-role logic**: Supabase Edge Functions do background/service-role work. The one pragmatic exception is the AgentOps sidecar (`scripts/agentops-server.mjs`), which already runs as trusted backend code in the Docker image and gets an optional service-role write path rather than a second new sidecar being introduced.
3. **Scope**: fully build the foundation (auth, orgs, workspaces, membership, repositories, activity, storage, queue plumbing) plus Supabase-back the areas with real UI but fake/local-only persistence (Workspace Memory, AgentOps, Knowledge/CodeGraph, Automations/Proactivation, Usage). Schema-only stubs for SME, Requirements, and durable KT-video artifacts.

## 6. Non-goals for this pass

- No JWT bridging between OpenHands Cloud auth and Supabase Auth.
- No replacement of the external Automation Server's own database — `automation_metadata` is an additive companion table only.
- No UI for SME, Requirements, or durable Video-KT playback — schema and RLS only.
- No deletion of any existing local persistence (localStorage, sandbox file mirrors, AgentOps JSONL, Zustand stores) — Supabase is an additive durable/cross-device layer underneath them, not a replacement. See the approved plan's "keep vs. remove" table for the explicit per-area rationale.
- No changes to `legacy/`'s own Supabase code or schema — its cleanup is a separate, out-of-scope decision.

## 7. What shipped in this pass

- `supabase/migrations/` — versioned schema, RLS, Storage buckets, the `pgvector` similarity-search RPC, applied to the `NeoDevEx` Supabase project (`hyirnyyqwyvplwvuekda`).
- `src/lib/data-platform/` — the interface layer (`client.ts`, repositories for workspace/memory/activity/agentops/knowledge/automation-metadata/usage, `artifact-store.ts`, `vector-store.ts`, `job-queue.ts`). No `supabase.from(...)` call exists outside this directory.
- Workspace Memory's third dual-write leg (`src/api/workspace-memory/workspace-memory-supabase-sync.ts`), wired into `writeRecords` as a fire-and-forget call — `src/lib/workspace-memory/isolation.test.ts` passes unmodified.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` documented in `.env.sample` and `.env.example`; the service-role key is not present anywhere in this repository.

## 8. Queued for follow-up PRs (not done in this pass)

Per the plan's independently-revertable migration order, these remain to be wired in future PRs — the foundation and interfaces they depend on are already in place:

- AgentOps sidecar dual-write (Supabase leg added to `scripts/agentops/store.mjs`, gated by env vars, injected via `docker/entrypoint.sh`) — including resolving how `AgentOpsRun.workspaceId` bridges to the `computeWorkspaceId()` hash format.
- Knowledge/CodeGraph hydration wiring into `knowledge-store.ts` / `codegraph-store.ts`.
- Automation/Proactivation companion-table UI wiring.
- Usage unification wiring (`usage-pipeline.ts` consumers).
- The formal RLS/isolation `execute_sql`-driven test suite (ad hoc versions of these checks were run once against the live project during this pass; see the plan's verification section).
