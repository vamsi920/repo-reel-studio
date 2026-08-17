# Proactive Agent — Stability Audit (pass 01/40)

**Scope:** Architecture map + risks + 39-step checklist. No product behavior changes in pass 01.  
**Workspace:** `/Users/vamsi/Desktop/repo-reel-studio`  
**Last mapped:** 2026-05-27 · **Backend audit (pass 39):** 2026-05-27

---

## 1. Purpose

Proactive Mode scans a repo offline, ranks static signals into **candidates**, runs each selected candidate through the same **Agent Ops / OpenDevin** executor used for issue-bound runs, and surfaces patch-backed items for **human approval** before any PR is opened.

---

## 2. Runtime topology

```text
Browser (Studio)
  └─ AgentRunsPanel.tsx
       └─ proactiveAgentOps.ts  →  GET/POST /api/proactive/*
            │
            ▼
Vite dev proxy (:8080) → /api → ingestion (:8787 default)
            │
            ├─ Node ingestion-server.mjs
            │     ├─ AGENT_RUNS_PROXY_URL unset → local JSON read + 503 on dispatch/approve/dismiss
            │     └─ AGENT_RUNS_PROXY_URL set   → forward to Python Agent API
            │
            └─ Python (either path)
                  ├─ ingest:server:python (ingestion-server.py :8787) — includes proactive router
                  └─ agent:server (agent_runs_app.py :8788) — proactive + agent runs only
```

| Script | Port | Proactive capability |
|--------|------|----------------------|
| `npm run dev` | 8080 | UI only; needs backend |
| `npm run ingest:server` | 8787 | Config/status/candidates read; **no dispatch** without proxy |
| `npm run agent:server` | 8788 | Full proactive API |
| `npm run ingest:with-agent` | 8787 + proxy → 8788 | Full proactive via Node forward |
| `npm run studio:backend` | 8788 + 8787 (proxy) | Recommended for Studio Agent Ops |
| `npm run dev:with-agent` | 8788 + 8787 + Vite | Full local Studio stack |
| `npm run ingest:server:python` | 8787 | Full proactive in single Python process |

**Frontend API base:** `src/env.tsx` → `API_URL` (default `/api`, resolved via `proactiveAgentOps.resolveApiPath`).

---

## 3. Module map

| Layer | File | Role |
|-------|------|------|
| Client API | `src/lib/proactiveAgentOps.ts` | Typed fetch wrapper, error normalization for missing routes |
| UI | `src/components/studio/AgentRunsPanel.tsx` | Proactive tab, toggle, dispatch, approve/dismiss, 2s polling, live console |
| HTTP | `server/proactive_api.py` | FastAPI routes; cron token on `dispatch-daily` only |
| Orchestration | `server/proactive_orchestrator.py` | Daily pipeline: workspace → discover → select → materialize → OpenDevin |
| Discovery scan | `server/proactive_discovery_scan.py` | Repo file listing + scannable source filters |
| Candidate scoring | `server/proactive_candidate_score.py` | Weighted score + selection threshold 0.62, max 6 |
| Candidate dedupe | `server/proactive_candidate_dedupe.py` | In-batch + recent-batch opportunity dedupe |
| Persistence | `server/proactive_store.py` | Filesystem store + `linkedRun` enrichment from agent runs |
| Agent runs | `server/agent_runs.py` | `RUNS_ROOT`, run lifecycle, `approve_agent_run_for_pr` |
| Executor | `server/opendevin_runner.py` | `OpenDevinAdapter.create_runner` / `apply_result_to_run` |
| Node shim | `server/ingestion-server.mjs` | Read-only proactive + proxy or 503 |
| Mount points | `server/agent_runs_app.py`, `server/ingestion-server.py` | `create_proactive_router()` under `/api` |

---

## 4. End-to-end flow

### 4.1 Operator (Studio)

1. User opens Studio → **Agent Ops** panel → **Proactive** workspace tab.
2. `getProactiveStatus` loads config, latest batch, top candidates (server caps at 6 in `summarize_status`).
3. Toggle → `POST /proactive/config` (`enabled`, `targetCount` max 6).
4. **Run now** → `POST /proactive/dispatch-daily` with `repoUrl`, `projectId`, `contextHints`, optional `targetCount`.
5. While batch/candidates/runs active → poll `getProactiveStatus` + `listAgentRuns` every **2s** (`isProactiveWorkActive`).
6. Approve candidate → `POST .../approve` → may call `approve_agent_run_for_pr` if patch + workspace exist.
7. Dismiss → `POST .../dismiss` → updates candidate + batch `progress.dismissed`.

### 4.2 Server (`dispatch_daily`)

1. Load config; if `enabled` is false → return `status: skipped` (no batch).
2. `prepare_discovery_workspace` — `repo_workspace.sync_cached_repo_workspace` if `projectId`, else clone/pull under scope `workspaces/discovery`, or `local://` copy.
3. `create_batch` → `status: discovering`.
4. `discover_candidates` — static scan (TODO/FIXME, centrality, lifecycle, package.json scripts).
5. `select_candidates` — score ≥ 0.62, dedupe by path prefix, cap `target` (1–6).
6. For each selected: `materialize_candidate_run` → writes `server/.agent-runs/<runId>/run.json`, links `candidate.runId`.
7. `execute_candidate_run` → copy workspace → `OpenDevinAdapter` → patch → `review_ready` or `needs_execution`.
8. Batch → `complete` or `failed`; return status payload.

### 4.3 Cron / automation

Full runbook: [PROACTIVE_DISPATCH_CRON.md](./PROACTIVE_DISPATCH_CRON.md).

| Trigger | Entry | Auth |
|---------|--------|------|
| **Scheduled** | `python3 server/proactive_dispatch_cron.py run --all-enabled` (in-process) or `server/scripts/proactive-dispatch-daily-cron.sh` (HTTP) | Bearer `PROACTIVE_CRON_TOKEN` on HTTP when env set (`enforce_cron_token` on `dispatch-daily` only) |
| **Manual (Studio)** | Run now / Dispatch today → same `POST /api/proactive/dispatch-daily` | No cron Bearer from UI today; works when `PROACTIVE_CRON_TOKEN` unset locally |

- `morningDeadline` + `timezone` on config are **display/planning only** until an external scheduler runs dispatch before that local time.
- `enabled: false` → stable `status: skipped` (`code: proactive_disabled`, `dispatchMode: disabled`, `manualOnly: true`); cron must filter with `list --enabled-only`.
- **UI does not send** Bearer token today; production cron should use HTTP + token or in-process helper on the agent host.

---

## 5. State machines

### 5.1 Batch (`proactive_store.create_batch` / orchestrator)

```text
discovering → scoring → materializing → complete
                              └────────→ failed
```

Skipped path (config): no batch; response `status: skipped`.

### 5.2 Candidate

```text
discovered
  → selected | not_selected
selected → executing (run created)
  → review_ready (patch + gates)
  → needs_execution (no patch / executor error)
  → dismissed (operator)
  → approved | approved_internal (approve endpoint)
```

**Note:** TS types in `proactiveAgentOps.ts` list `observed`, `patching`, `validating`, etc.; orchestrator uses `executing`, `needs_execution`, timeline `stage` values, and API may set `approved_internal` — not all values appear in frontend unions.

### 5.3 Linked Agent run (`agent_runs.RUN_STATES`)

```text
preparing → running → awaiting_review | failed
awaiting_review → approved | rejected (issue flow)
```

Proactive runs use `issueUrl: proactive://candidate/<id>` and `run.proactive: { candidateId, batchId }`.

---

## 6. Persistence paths

All under `server/` (same directory as Python modules).

| Store | Path pattern | Contents |
|-------|----------------|----------|
| Proactive scope | `.proactive-agent-ops/<scopeKey>/` | `scopeKey = sha256(repoUrl::projectId)[:24]` |
| Config | `.../config.json` | `enabled`, `targetCount` (1–6), `qualityMode`, `timezone`, `morningDeadline` |
| Batches | `.../batches/<batchId>.json` | status, progress, metrics, timestamps |
| Candidates | `.../candidates/<candidateId>.json` | scores, timeline, `runId`, review metadata |
| Discovery workspace | `.../workspaces/discovery/` | git clone or copy |
| Agent runs | `.agent-runs/<runId>/run.json` | Full run record |
| Run workspace | `.agent-runs/<runId>/workspace/` | Per-candidate sandbox copy |
| Artifacts | `.agent-runs/<runId>/` (via `save_artifacts`) | patch, validation output |

Writes use temp file + `replace` + `threading.Lock` in Python store; Node local helpers mirror layout for read-only paths.

**Not in Firestore/Supabase** — proactive state is filesystem-only in current code.

---

## 7. API endpoints

Base: `/api/proactive` (plus Vite `/api` proxy prefix when `API_URL=/api`).

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/config?repoUrl&projectId` | — | Read/merge config |
| POST | `/config` | — | Patch allowed config fields |
| GET | `/status?repoUrl&projectId` | — | Config + latest batch + ready count + ≤6 enriched candidates |
| GET | `/candidates?repoUrl&projectId&batchId&includeDismissed` | — | List (limit 100) |
| GET | `/candidates/{id}` | — | Single + `linkedRun` |
| POST | `/dispatch-daily` | Bearer if `PROACTIVE_CRON_TOKEN` set | Full orchestrator (sync, long-running) |
| POST | `/candidates/{id}/approve` | — | PR promotion or internal approval |
| POST | `/candidates/{id}/dismiss` | — | Mark dismissed, refresh batch progress |

**Health (related):** `GET /api/health` (ingestion) exposes `agentRuns.mode` / `agentReachable` — probed by `AgentRunsPanel` on mount.

---

## 8. UI polling & active detection

`isProactiveWorkActive` returns true when:

- `proactiveAction === "dispatch"`, or
- batch status not in `complete` | `failed` | `cancelled`, or
- any candidate in `selected`, `executing`, `patching`, `validating`, `discovering`, `scoring`, or linked run in `queued` | `preparing` | `running` | `validating`.

Issue-bound runs poll every **3.2s** when active; proactive uses **2s**.

---

## 9. OpenDevin integration (proactive path)

`materialize_candidate_run` → `execute_candidate_run`:

1. `prepare_candidate_workspace` — copy discovery tree, `git init` baseline if needed.
2. `OpenDevinAdapter.create_runner(workspace, run, env_artifacts)`.
3. `runner.run(issue=synthetic_issue, context_hints, env_artifacts)`.
4. `apply_result_to_run` — patch, validation, quality gates into `run.json`.
5. Patch present → run `awaiting_review`, candidate `review_ready`; else `needs_execution`.

Executor may fall back to Gemini path inside `opendevin_runner.py` when OpenDevin API/CLI/Docker unavailable.

Optional: `generate_ai_console_log` (Gemini) appends AI-styled timeline entries when `GEMINI_API_KEY` / `VITE_GEMINI_API_KEY` present.

---

## 10. Discovery scan boundaries (pass 06)

Implemented in `server/proactive_discovery_scan.py` and used by `discover_candidates` / `build_import_counts`.

### 10.1 `list_repo_files(workspace)`

| Rule | Detail |
|------|--------|
| Input root | Resolved `workspace` directory |
| Git repos | `git ls-files` (tracked paths only) |
| Non-git | `workspace.rglob("*")` |
| Directory exclusions | Any path segment in `SCAN_EXCLUDED_DIR_NAMES` (e.g. `node_modules`, `vendor`, `dist`, `build`, `coverage`, `.next`, `.cache`, `__pycache__`, `.venv`, `target`, `.turbo`, `.proactive-agent-ops`, `.agent-runs`, …) |
| File type | Must be a regular file (`is_file()`); skips directories and broken symlinks |
| Cap | Max `SCAN_MAX_LISTED_FILES` (8000) unique relative paths, sorted |
| Not applied here | Extension, size, or binary filtering |

### 10.2 `is_scannable_source_file` / `filter_scannable_source_files`

Applied after listing, before reading file contents for signals.

| Rule | Detail |
|------|--------|
| Extensions | `SCAN_SOURCE_EXTENSIONS` (same set as `agent_runs.SOURCE_EXTENSIONS`) |
| Max size | `SCAN_MAX_FILE_BYTES` = 80,000 bytes (`stat` errors → skip) |
| Binary | Known binary suffixes **or** ≥20% non-text bytes in first 512 bytes (NUL → binary) |
| Reads | `discover_candidates` reads up to 24,000 chars; `build_import_counts` up to 16,000 |

### 10.3 Candidate output

Unchanged: `build_candidate` / `discover_candidates` return shape is identical; only which paths are scanned changed.

---

## 11. Candidate dedupe policy (pass 08)

Implemented in `server/proactive_candidate_dedupe.py` during `discover_candidates` and `select_candidates`.

### 11.1 Opportunity keys (same logical issue)

| Key | Matches |
|-----|---------|
| `path:kind` | Primary `dedupeKey` (e.g. `src/foo.ts:bug`) |
| `path:<path>` | Any type on the same file in the batch |
| `path_kind:<path>:<kind>` | Same file + candidate type |
| `title:<normalized title>` | Same normalized title text |
| `title:<path>:<normalized title>` | Same title scoped to a file |

Normalization: paths strip leading `/` and use forward slashes; titles are lowercased alphanumeric tokens (max 96 chars).

### 11.2 Within active batch

1. Compare against `BatchDedupeRegistry` while discovering.
2. Keep the **stronger** candidate by `score.total`, then centrality, signal, `createdAt`.
3. Weaker duplicates stay in the batch JSON with `status: "not_selected"` and `notSelectedReason` starting with `Duplicate opportunity (...)` or `Superseded in this batch (...)`.
4. Stronger later discovery can supersede an earlier keeper in the same batch.

### 11.3 Recent batches

1. Load up to **3** most recent batches for the same `repoUrl` + `projectId` (excluding the active batch id).
2. Index strongest prior candidates by the same opportunity keys (includes dismissed/review_ready/not_selected).
3. New candidate weaker than a recent match → `not_selected` with `Duplicate opportunity (...) already surfaced in recent batch <id>`.
4. New candidate stronger than a recent match → allowed (older batch records are not rewritten).

### 11.4 Selection phase

1. Skip candidates already marked `not_selected` from dedupe.
2. Apply score threshold `0.62` and max **6** selected.
3. Enforce **one selected candidate per path** unless the later candidate scores ≥ `0.82` (`DEDUPE_STRONG_THRESHOLD`), in which case it may replace the path winner.

### 11.5 JSON compatibility

No required new fields. Existing `dedupeKey`, `status`, `notSelectedReason`, `selectedReason` carry dedupe outcomes.

---

## 11.6 Validation detection (pass 09)

Discovery builds a structured `validationProfile` per batch (also mirrored on each candidate) and **string** `evidence` lines for UI.

| Field | Meaning |
|-------|---------|
| `source` | Primary detector: `env_artifacts`, `package_json`, `python_config`, `none`, or `merged` |
| `overall` | `strong` (test + lint/build), `moderate` (any command bucket), `weak` (python markers only), `none` |
| `languages` | e.g. `node`, `python` from env detect + heuristics |
| `commands` | Buckets `test`, `lint`, `build`, `typecheck` → string command lists (no secrets in evidence) |
| `sources` | All detectors that contributed |
| `markers` | Python config filenames (`pytest.ini`, `pyproject.toml`, …) |

Priority: **env_builder artifacts** → **package.json scripts** (parsed JSON) → **python config files**. Scoring reads `validationProfile` when present; legacy string hints still work for older candidates.

Evidence lines remain plain strings (e.g. `Validation commands available: test, lint`) so `AgentRunsPanel` candidate evidence rendering is unchanged.

Module: `server/proactive_validation_detect.py` · validate: `python3 validate_proactive_validation_detect.py`

---

## 11.7 Materialize state consistency (pass 10)

`server/proactive_materialize.py` owns phased sync between **candidate JSON**, **run JSON**, **run timeline**, and **batch progress** counters.

| Phase | Run `status` | Candidate `status` | `stage` | `reviewReady` |
|-------|--------------|-------------------|---------|---------------|
| `run_linked` | `preparing` | `executing` | `preparing` | false |
| `workspace_ready` / `executor_started` | `running` | `executing` | `patching` | false |
| `validating` | `running` | `executing` | `validating` | false |
| `review_ready` | `awaiting_review` | `review_ready` | `review_ready` | true |
| `no_patch` / `execution_error` | `failed` | `needs_execution` | `needs_execution` | false |

`approval.status` stays **`pending`** until human promotion (gates preserved). `sync_materialize_pair` asserts `runId` / `proactive.candidateId` alignment before persisting.

Validate: `python3 validate_proactive_materialize.py`

---

## 11.8 Cancellation and timeout (pass 11)

Reuses Agent Ops `control.cancelRequested` on linked runs (`POST /agent-runs/{id}/cancel`).

| Outcome | Run `status` | `failureCategory` | Candidate `status` | `stage` | PR approval |
|---------|--------------|-------------------|-------------------|---------|-------------|
| Cancelled | `cancelled` | `cancelled` | `needs_execution` | `cancelled` | blocked (`prApprovalBlocked`) |
| Timed out | `failed` | `timeout` | `needs_execution` | `timed_out` | blocked |

Executor wall clock: `PROACTIVE_EXECUTOR_TIMEOUT_SECONDS` (default 1200). Human `approve` on proactive candidates rejects blocked/cancelled/timed-out linked runs; patch-backed approval semantics unchanged for successful runs.

Module: `server/proactive_execution_control.py` · validate: `python3 validate_proactive_execution_control.py`

---

## 11.9 No-patch vs executor crash (pass 12)

| `failureCategory` | Meaning | Candidate pill | `executionFailure` |
|-------------------|---------|----------------|--------------------|
| `no_patch` | Executor finished, empty diff | **No Patch** | `isNoPatch: true` |
| `execution_error` | Backend/exception before patch | **Executor Error** | `isBackendCrash: true` |

Persisted on linked run: `artifacts.failureCategory`, structured `validation.notes`, blocked `approval.instructions`. On candidate: `reviewMetadata.executionReason`, `retryInstructions`, `executionFailureKind`. API `enrich_candidate` adds `executionFailure` for UI.

Validate: `python3 validate_proactive_no_patch_failure.py`

---

## 11.10 Review-ready requirements (pass 13)

`review_ready` requires **all** of: non-empty patch, changed files, saved artifact paths, `qualityGates` metadata, `validation` metadata. **Policy gate violations** block promotion to `review_ready` (candidate stays `needs_execution`).

Validation coverage is labeled `full` | `partial` | `missing` on the candidate without blocking internal review when artifacts are otherwise complete. `approval.status` stays **`pending`** until explicit human approve.

Module: `server/proactive_review_ready.py` · validate: `python3 validate_proactive_review_ready.py`

---

## 11.11 Proactive approval (pass 14)

`POST /proactive/candidates/{id}/approve` uses `proactive_approval.approve_proactive_candidate`.

| Outcome | When | PR opened |
|---------|------|-----------|
| `promote_pr` | `review_ready`, linked run `awaiting_review`, patch + artifact paths + `workspacePath`, policy clear | Yes (`approve_agent_run_for_pr`) |
| `approved_internal` | No linked run, or patch/workspace/status/policy not PR-ready | No |
| `reject` (4xx) | Already approved/dismissed, blocked execution, not `review_ready` | No |

Validate: `python3 validate_proactive_approval.py`

---

## 11.12 Dismiss flow (pass 15)

`POST /proactive/candidates/{id}/dismiss` records a **timeline** event, sets `status: dismissed`, and recomputes the candidate's batch `progress` (`ready`, `dismissed`, …) from all candidates with `include_dismissed=True`. Default candidate lists hide dismissed rows; `GET /proactive/candidates?includeDismissed=true` returns them.

Frontend `applyProactiveCandidatePatch` removes dismissed cards from local state and uses server `batch.progress.ready` so ready totals do not drift.

Validate: `python3 validate_proactive_dismiss.py` · `npm run test -- src/lib/proactiveDismiss.test.ts`

---

## 11.13 Status summary (pass 16)

`build_status_summary` (via `summarize_status`) returns stable fields for `proactiveAgentOps.ts`: `config`, `batch`, `ready`, `target`, `candidates`, `shortfallReason`.

- Batch pick: newest **in-progress** batch, else newest batch
- `ready` / `batch.progress` from all batch candidates (includes dismissed in progress only)
- `candidates`: top 6 non-dismissed, score-sorted, `linkedRun` enriched
- `target`: batch `targetCount` else config
- `shortfallReason`: batch metrics when set, else derived for failed / in-progress / complete shortfall

Validate: `python3 validate_proactive_status_summary.py`

---

## 11.14 API errors and auth (pass 17)

- `validate_repo_url_param` on all scoped GET query routes and POST bodies (`http`/`https`/`local://`, GitHub repo shape for `https://github.com/...`).
- `PROACTIVE_CRON_TOKEN` → `401` + `invalid_cron_token` on `POST /dispatch-daily` when env set; omit env for local dev.
- Proactive routes return structured `detail: { message, code, field?, hint?, errors? }` via `register_proactive_exception_handlers`.
- Client: `formatProactiveApiErrorDetail` in `proactiveAgentOps.ts`.

Validate: `python3 validate_proactive_api.py` · `npm run test -- src/lib/proactiveApiErrors.test.ts`

---

## 11.15 Node ingestion shim (pass 18)

`server/proactive_node_shim.mjs` backs Node-only proactive routes in `ingestion-server.mjs`:

- Read routes (`GET` config/status/candidates/candidate) mirror Python shapes: structured `detail` errors, status summary (`batch.progress`, `ready`, `target`, `shortfallReason`, ≤6 enriched candidates).
- Write routes without proxy (`POST` dispatch/approve/dismiss) return **503** + `proactive_backend_required` hint; `POST` config still updates local JSON for offline toggles.
- Proxy path coerces upstream JSON errors and returns actionable **503** `proactive_proxy_unreachable` on fetch failures.

Validate: `node --test server/validate_proactive_node_shim.mjs`

---

## 11.16 OpenDevin fallback (pass 19)

When OpenDevin API/CLI/Docker is unavailable, `OpenDevinRunner` tries the legacy Gemini mini-SWE executor (`opendevin_fallback.try_legacy_executor`). If both fail, runs expose `executor_mode=unavailable`, explicit `error`, and proactive candidates land on transparent `needs_execution` (`opendevin_unavailable` / `legacy` sources). Docker probe runs only when `OPENDEVIN_ENABLE_DOCKER_PROBE=1` (no silent echo-only success).

Validate: `python3 validate_proactive_opendevin_fallback.py`

---

## 11.17 Sandbox policy (pass 20)

`proactive_sandbox_policy.py` enforces proactive run `policy` (`commandAllowlist`, `pathDenylist`, `networkPolicy`), repo forbidden paths, sensitive-path tagging, and validation-command allowlisting. Violations land on `run.policyViolations`, `artifacts.sandboxPolicy`, `artifacts.policyAudit`, and candidate `reviewMetadata` (approval gates unchanged — violations still block `review_ready` and PR promotion).

Validate: `python3 validate_proactive_sandbox_policy.py`

---

## 11.18 Branch naming (pass 21)

`proactive_branch_name.py` builds `neodevex/proactive-{repo}-c{candidate}-r{run}-{slug}` branches (sanitized, ≤64 chars). Materialize seeds `approval.branchName`; PR promotion uses `resolve_approval_branch_name` so manual `branchName` overrides still win.

Validate: `python3 validate_proactive_branch_name.py`

---

## 11.19 AI console logs (pass 22)

`proactive_ai_console.py`: deterministic timeline `seq` ordering, sanitized output (no secrets), capped Gemini latency (`PROACTIVE_AI_LOG_TIMEOUT_SECONDS`), deterministic fallback when `GEMINI_API_KEY` is missing or model output invents tool actions.

Validate: `python3 validate_proactive_ai_console.py`

---

## 11.20 Storage retention and cleanup (pass 23)

`proactive_retention.py` defines **dry-run-first** cleanup plans. Nothing is deleted unless `PROACTIVE_CLEANUP_EXECUTE=1`.

### What may be pruned (low risk)

| Asset | Eligible when | Never touches |
|-------|----------------|---------------|
| Batch JSON | Terminal (`complete`/`failed`/`cancelled`), older than `PROACTIVE_RETENTION_DAYS` (default 30), outside newest `PROACTIVE_KEEP_BATCHES` (default 5), not active | Active batch, latest batch, recent keep window |
| Candidate JSON | `dismissed` or `discovered` only, batch slated for removal, same age gate | `review_ready`, in-flight statuses, approved*, linked runs with patches/PR artifacts |
| Proactive `workspaces/discovery` | No active batch, latest batch idle past min age | Active dispatch workspace |
| Agent run `workspace/` dir | Terminal run, no patch/PR artifacts, unlinked or run not protected, past retention | `awaiting_review` / in-flight runs, runs referenced by protected candidates |

`config.json`, `.corrupt/` quarantine, and run `run.json` records are **not** auto-deleted (preserves operator history and user artifacts).

### Manual cleanup (from `server/`)

Dry-run plan for one repo scope:

```bash
cd server
PROACTIVE_STORE_ROOT="$PWD/.proactive-agent-ops" python3 -c "
from proactive_retention import plan_scope_retention
import json
plan = plan_scope_retention('https://github.com/ORG/REPO', project_id=None, dry_run=True, min_age_hours=24)
print(json.dumps(plan.summary(), indent=2))
"
```

Execute deletions (requires explicit opt-in):

```bash
PROACTIVE_CLEANUP_EXECUTE=1 PROACTIVE_RETENTION_DAYS=30 PROACTIVE_KEEP_BATCHES=5 \
  python3 -c "
from proactive_retention import plan_scope_retention, execute_retention_plan
plan = plan_scope_retention('https://github.com/ORG/REPO', project_id=None, dry_run=False, min_age_hours=24)
print(execute_retention_plan(plan))
"
```

All scopes dry-run:

```bash
python3 -c "
from proactive_retention import plan_all_scopes_retention
import json
for plan in plan_all_scopes_retention(dry_run=True):
    print(json.dumps(plan.summary(), indent=2))
"
```

Remove stale agent run sandboxes only (keeps `run.json`):

```bash
python3 -c "
from proactive_retention import plan_run_workspace_retention
for path in plan_run_workspace_retention(dry_run=True):
    print(path)
"
```

Validate: `python3 validate_proactive_retention.py`

---

## 11.21 Core store/orchestrator tests (pass 24)

Focused `unittest` modules under `server/tests/` use temp `PROACTIVE_STORE_ROOT`, FastAPI stubs, and no network I/O.

| Module | Coverage |
|--------|----------|
| `test_proactive_store.py` | Config, batch lifecycle, candidate list/progress/find, status summary shape, idempotent batch reuse, `select_candidates` threshold |
| `test_proactive_orchestrator.py` | `build_candidate` scoring, `discover_candidates`, dedupe registry, `mark_candidate_ready` / `mark_candidate_needs_execution`, status `ready` + `needs_execution` |

**Exact commands** (from repo root):

```bash
npm run test:proactive
```

Equivalent:

```bash
cd server && python3 -m unittest discover -s tests -p 'test_proactive_*.py' -v
```

Validator wrapper (pass 24 gate, same suite):

```bash
cd server && python3 validate_proactive_core_tests.py
```

---

## 11.22 FastAPI proactive API routes (pass 25)

`server/tests/test_proactive_api.py` uses `TestClient` with the same mount pattern as `agent_runs_app.py` (`register_proactive_exception_handlers` + `create_proactive_router()` under `/api`). Heavy paths are mocked (`dispatch_daily`, `run_console_summary`); no OpenDevin, GitHub, or secrets.

| Route | Covered behavior |
|-------|------------------|
| `GET/POST /proactive/config` | Read defaults, patch, invalid `targetCount` → `invalid_config` |
| `GET /proactive/status` | Ready count + candidate cap |
| `GET /proactive/candidates` | List + `includeDismissed` filtering via batch |
| `GET /proactive/candidates/{id}` | Detail enrichment |
| `POST /proactive/dispatch-daily` | Disabled → skipped; cron 401; authorized stub dispatch |
| `POST .../approve` | Internal approval without linked run |
| `POST .../dismiss` | Operator dismiss |
| Invalid id | Structured `candidate_not_found` on get/approve/dismiss |
| `agent_runs_app` | Asserts proactive routes remain registered |

Requires FastAPI installed (`pip install -r server/requirements.txt` in a venv). Skips cleanly when FastAPI is missing.

**Exact commands** (repo root):

```bash
npm run test:proactive:api
```

Equivalent:

```bash
cd server && python3 validate_proactive_api_routes.py
```

Full API route unittest module:

```bash
cd server && python3 -m unittest tests.test_proactive_api -v
```

---

## 11.23 TypeScript proactive client contracts (pass 26)

`src/lib/proactiveNormalize.ts` guards unknown backend payloads. `proactiveAgentOps.ts` normalizes all read paths (`getProactiveStatus`, candidate list/detail, dispatch, approve, dismiss) and unwraps nested FastAPI `detail` objects in `requestJson` / `formatProactiveApiErrorDetail`. API paths unchanged.

**Exact command** (repo root):

```bash
npm run test:proactive:client
```

Focused module only:

```bash
npm run test -- src/lib/proactiveAgentOps.test.ts
```

---

## 11.24 AgentRunsPanel polling stability (pass 27)

`AgentRunsPanel` uses `selectedIdRef` (no stale poll closures), `createSerialTaskRunner` guards on `loadRuns` / `loadProactive`, adaptive backoff via `agentOpsPolling.ts` when the proactive backend is down, and background polls that avoid full-panel loading during long dispatch (`proactiveSyncing` + `Scanning`/`Dispatching` labels).

**Exact command** (repo root):

```bash
npm run test -- src/lib/agentOpsPolling.test.ts
```

---

## 11.25 Agent Ops health diagnostics (pass 28)

`/api/health` (Node + Python ingestion) and `/api/health-agent` (Python Agent Ops) expose:

| Field | Meaning |
|-------|---------|
| `agentRuns.connected` | Python Agent Ops reachable (native or via proxy) |
| `agentRuns.routesAvailable` / `proactive.routesAvailable` | Routes registered on the active backend |
| `agentRuns.writes` / `proactive.writes` | `full`, `read-only` (Node shim), or `proxied` |

UI: `src/lib/agentOpsHealth.ts` → `AgentRunsPanel` hints via `resolveAgentBackendHint` / `resolveProactiveBackendHint`.

**Verify** (repo root):

```bash
npm run test -- src/lib/agentOpsHealth.test.ts
cd server && python3 validate_agent_ops_health.py
node server/validate_agent_ops_health.mjs
curl -s http://127.0.0.1:8787/api/health | head -c 800
curl -s http://127.0.0.1:8788/api/health-agent | head -c 800
```

---

## 11.26 Synthetic proactive issues (pass 29)

`proactive_synthetic_issue.py` builds structured executor briefs (summary, evidence, validation focus, blast radius, type-specific constraints) with body caps. `materialize_candidate_run` seeds the linked run via `attach_synthetic_issue_to_run`; `proactive://candidate/{id}` URLs unchanged.

Validate: `python3 validate_proactive_synthetic_issue.py`

---

## 11.36 Full backend audit (pass 39)

Post–pass 38 audit of passes 01–38: `npm run verify:proactive` green; §13 checklist updated; residual risks in §12; one validator flake fix (failure recovery batch ordering). No product/UI layout changes.

---

## 11.35 Final backend verification (pass 38)

Single gate for proactive backend stability before merge/release. **Does not** run repo-wide `npm run lint` (known noisy/unrelated).

| Step | Command | Notes |
|------|---------|--------|
| 1 — Python compile | `cd server && python3 verify_proactive_stability.py` (phase 1) | All `proactive_*.py`, `validate_proactive_*.py`, `test_proactive_*.py` |
| 2 — Validator smokes | same script (phase 2) | 30 curated `validate_proactive_*.py` modules, no servers |
| 3 — Focused unittest | same script (phase 3) | `test_proactive_*.py` discover |
| 4 — Node shim | `npm run verify:proactive:node` | `validate_proactive_node_shim.mjs` |
| 5 — TS contracts | `npm run test:proactive:client` | Vitest on proactive client modules only |

**One-shot (recommended, repo root):**

```bash
npm run verify:proactive
```

Backend only:

```bash
npm run verify:proactive:backend
```

Optional FastAPI route gate (requires venv + `pip install -r server/requirements.txt`):

```bash
cd server && python3 verify_proactive_stability.py --with-api-routes
# or: npm run test:proactive:api
```

Faster loop (compile + unittest, skip validator smokes):

```bash
cd server && python3 verify_proactive_stability.py --skip-validators
```

Legacy focused commands (still valid):

```bash
npm run test:proactive
npm run test:proactive:discovery-fixture
npm run test:proactive:failure-recovery
```

**Explicitly out of scope for this gate:** `npm run lint`, full `vite build`, live dispatch against GitHub/OpenDevin.

---

## 11.34 Failure-mode recovery (pass 37)

`proactive_failure_recovery.py` keeps `/proactive/status`, candidate list/detail, and enrichment usable when store/run JSON is corrupt, runs are missing, workspaces are gone, validation fails, or batches are `failed`. Corrupt proactive records are quarantined under `.corrupt/` (not deleted). Linked runs return `status: unavailable` + `recoveryCode` instead of raising.

Validate:

```bash
cd server && python3 validate_proactive_failure_recovery.py
python3 -m unittest tests.test_proactive_failure_recovery -v
```

---

## 11.33 Discovery dry-run fixture (pass 36)

Deterministic tiny repo in `proactive_discovery_fixture.py` — TODO, central untested hub, package scripts, auth/secrets paths. No GitHub/OpenDevin. Runbook: [PROACTIVE_DISCOVERY_FIXTURE.md](./PROACTIVE_DISCOVERY_FIXTURE.md).

Validate:

```bash
cd server && python3 validate_proactive_discovery_fixture.py
python3 -m unittest tests.test_proactive_discovery_fixture -v
```

---

## 11.32 Daily dispatch cron story (pass 35)

Cron runbook: [PROACTIVE_DISPATCH_CRON.md](./PROACTIVE_DISPATCH_CRON.md). Helpers: `server/proactive_dispatch_cron.py`, `server/scripts/proactive-dispatch-daily-cron.sh`. `list_proactive_dispatch_scopes(enabled_only=True)` for schedulers. Skipped contract: `build_dispatch_skipped_response` + `validate_proactive_dispatch_skipped.py`.

Validate:

```bash
cd server && python3 validate_proactive_dispatch_skipped.py
python3 -m unittest tests.test_proactive_dispatch_skipped tests.test_proactive_api.ProactiveApiRouteTests.test_dispatch_skipped_without_executor -v
```

---

## 11.31 githubToken handling (pass 34)

`githubToken` is accepted on `POST /proactive/dispatch-daily` only. `transient_github_token()` scopes env for project-cache sync and scoped git clone/pull; `proactive_store._write_json` strips sensitive keys; git/errors redacted via `proactive_secret_sanitizer`. FE omits empty `githubToken` from dispatch body.

Validate:

```bash
cd server && python3 validate_proactive_github_token.py
python3 -m unittest tests.test_proactive_github_token -v
```

---

## 11.30 Local repository hardening (pass 33)

`proactive_local_repo.py` resolves `local://` paths safely, copies snapshots without following external symlinks, skips vendor/build dirs, and blocks overlap with the source root. `list_repo_files` uses bounded `os.walk` for non-git trees. GitHub discovery paths unchanged.

Validate:

```bash
cd server && python3 validate_proactive_local_repo.py
python3 validate_proactive_workspace.py
```

---

## 11.29 Policy violation visibility (pass 32)

`proactive_policy_visibility.py` classifies `clear` / `warning` (sensitive paths) / `blocked` (hard violations). Propagates to candidate, `reviewMetadata.policyBlockReasons`, linked run summary, and `executionFailure`. Approval: hard block → HTTP 403; warning → internal approval only (PR discouraged). UI: `PolicyVisibilityPanel` on cards + console.

Validate:

```bash
cd server && python3 validate_proactive_policy_visibility.py
npm run test:proactive:client
```

---

## 11.28 Linked-run validation artifacts (pass 31)

`proactive_linked_run.py` builds enriched `linkedRun` summaries from Agent Ops runs: validation commands (stdout/stderr truncated), notes, `testMatrix`, `qualityGates`, `diffStat`, and `changedFiles`. `run_console_summary` delegates here; executor persists artifacts immediately after `apply_result_to_run`. Frontend normalizers and Proactive console surface matrix/gates/files.

Validate:

```bash
cd server && python3 validate_proactive_linked_run.py
npm run test:proactive:client
```

---

## 11.27 Manifest/graph context hints (pass 30)

`proactive_context_hints.py` normalizes dispatch `contextHints` (repo-relative paths, `local://`, caps, evidence counts). Discovery applies tiered hint bonuses (focus/hub/entry) and manifest evidence floors on focus paths. Batches persist `contextHints`; materialized runs merge dispatch hints via `merge_run_context_hints`. Frontend: `src/lib/proactiveContextHints.ts` + `serializeProactiveContextHints` on `dispatchProactiveDaily`.

Validate:

```bash
cd server && python3 validate_proactive_context_hints.py
npm run test:proactive:client
```

---

## 12. Residual risks (post passes 01–39)

Mitigations from passes 02–38 are in module validate scripts and `npm run verify:proactive`. Items below remain **accepted** or **deferred** (not fixed in pass 39).

| ID | Risk | Status | Notes |
|----|------|--------|-------|
| R1 | Node-only ingestion without `AGENT_RUNS_PROXY_URL` | Open | Dispatch/approve/dismiss **503**; documented in §2 |
| R2 | `dispatch_daily` synchronous on HTTP worker | Deferred | §13 item 3 — needs async/202 design |
| R3 | TS status union ≠ all Python statuses | Open | §13 item 4 — backend emits `executing`, `needs_execution`, `approved_internal` |
| R4 | `find_candidate` glob scans all scopes | Open | §13 item 5 |
| R5 | `summarize_status` caps at **6** candidates | Open | By design; §13 item 6/27 |
| R6 | `PROACTIVE_CRON_TOKEN` set but UI has no Bearer | Open | Cron HTTP only; manual Run needs token unset or proxy |
| R7 | Cron external; `morningDeadline` not enforced in-app | Mitigated | Pass 35 runbook + `proactive_dispatch_cron.py` |
| R8 | Git clone/pull failures | Open | Batch `failed`; `storeRecovery` + shortfall (pass 37) |
| R9 | OpenDevin unavailable / no patch | Mitigated | Pass 12/19 metadata; `needs_execution` path |
| R10 | Ops data under `server/.proactive-agent-ops/` | Mitigated | Pass 23 retention; **pass 39:** `.gitignore` entry |
| R11 | Dual-server proxy misconfiguration | Open | Use `studio:backend` / `dev:with-agent` |
| R12 | Batch `complete` before last run finishes | Open | §13 item 22 |
| R13 | Approve without patch / toast copy | Open | §13 item 29 — no UI layout change in pass 39 |
| R14 | Large repo discovery cost | Mitigated | Pass 06 scan caps |
| R15 | `githubToken` in dispatch body | Mitigated | Pass 34 transient + store strip |
| R16 | Corrupt store/run JSON | Mitigated | Pass 37 quarantine + `linkedRun` recovery |

---

## 13. Implementation checklist (39 steps) — status after pass 39

Pass **01** = architecture map. Passes **02–38** implemented backend/storage/API hardening. Pass **39** = full backend audit + checklist closure. Pass **40** = final sign-off table (§16).

| # | Item | Status | Pass / notes |
|---|------|--------|----------------|
| 1 | Env vars in `.env.example` | **Done** | `PROACTIVE_CRON_TOKEN`, `PROACTIVE_DISPATCH_API_BASE`, executor timeout names |
| 2 | Proactive health on `health-agent` | Deferred | Use `npm run verify:proactive` + existing health routes |
| 3 | Async `dispatch-daily` | Deferred | R2 |
| 4 | Align candidate status enum (Py/TS/UI) | Partial | TS normalizers tolerate unknown; pills §13.28 |
| 5 | Optimize `find_candidate` | Deferred | R4 |
| 6 | `GET /proactive/batches` | Deferred | `list_batches` exists; no public route |
| 7 | Full candidate list contract | Partial | `GET /proactive/candidates`; status caps at 6 |
| 8 | UI cron Bearer / dev bypass | Deferred | R6; cron via server/proxy only |
| 9 | Dispatch timeout + heartbeat | Partial | Pass 11 execution control |
| 10 | Idempotent dispatch | **Done** | Pass 04 `check_dispatch_idempotency` |
| 11 | Structured `shortfallReason` | Partial | Sanitized strings; not full error-code enum |
| 12 | Retention job | **Done** | Pass 23 `proactive_retention.py` |
| 13 | Cap discovery file walk | **Done** | Pass 06 |
| 14 | Mid-batch progress % | Deferred | Batch phases only |
| 15 | Retry `needs_execution` | Deferred | |
| 16 | Separate discovery workspace lock | Partial | Pass 05 scope lock |
| 17 | Sync errors surface to UI | Partial | Failed batch + shortfall |
| 18 | Validation detection | **Done** | Pass 09; env load failures still quiet |
| 19 | `select_candidates` tests | **Done** | Pass 07–08 |
| 20 | Mock OpenDevin → `review_ready` IT | Deferred | Validators mock paths only |
| 21 | Log executor fallback on run | Partial | `failureCategory` on artifacts |
| 22 | Cancel in-flight dispatch | Partial | Pass 11 cancel/timeout |
| 23 | Node 503 parity | Partial | Pass 18 shim tests |
| 24 | Proactive proxy health bit | Deferred | |
| 25 | Node refuse dispatch + hint | Deferred | |
| 26 | Node/Python enrich parity | Partial | Pass 18 node shim tests |
| 27 | `listProactiveCandidates` when >6 | Deferred | R5 |
| 28 | Map all statuses in pills | Deferred | R3 — no UI change pass 39 |
| 29 | Approve toast copy | Deferred | R13 |
| 30 | Cron Bearer not in Vite bundle | **Done** | Pass 34–35 |
| 31 | Poll backoff | Partial | Pass 27 `agentOpsPolling` tests |
| 32 | Shortfall in header | Partial | Data available on status |
| 33 | Disable dispatch when active | Partial | `isProactiveWorkActive` exists |
| 34 | `.gitignore` proactive ops | **Done** | Pass 39 `server/.proactive-agent-ops/` |
| 35 | `proactive:status` CLI | Partial | `safe_build_status_summary` / API |
| 36 | Production deploy docs | Deferred | §2 scripts table |
| 37 | Load test 6× OpenDevin | Deferred | Manual |
| 38 | Chaos mid-dispatch | Partial | Pass 37 failure recovery tests |
| 39 | Final regression sign-off | Pass 40 | §16 |

---

## 14. Pass 38 stability sign-off (backend)

Gate: `npm run verify:proactive` — see §16 for pass 39 recorded output.

---

## 14.1 Pass 39 full backend audit

**Command (repo root, 2026-05-27):**

```bash
npm run verify:proactive
```

**Result: PASS** (exit 0). Summary:

| Phase | Result |
|-------|--------|
| `verify_proactive_stability.py` compile | 75 files OK |
| Validator smokes | 30/30 OK |
| `unittest` `test_proactive_*.py` | 50 ran, 41 passed, **9 skipped** (FastAPI route tests when `fastapi` not installed) |
| `validate_proactive_node_shim.mjs` | 9/9 OK |
| Vitest `test:proactive:client` | 10 files, 41 tests OK |

**Fix in pass 39 (low risk):** `validate_proactive_failure_recovery.py` — deterministic `createdAt` when asserting failed batch surfaces in status (flaky ordering vs complete batch).

**Not run (intentional):** `npm run lint`, `vite build`, live GitHub/OpenDevin dispatch.

Optional with venv:

```bash
cd server && python3 verify_proactive_stability.py --with-api-routes
```

---

## 14.2 Pass 01 verification

Run from repo root (no servers required for doc-only pass):

```bash
test -f docs/proactive-agent-stability-audit.md
rg -n "dispatch_daily|create_proactive_router|proactiveAgentOps" \
  server/proactive_orchestrator.py server/proactive_api.py src/lib/proactiveAgentOps.ts
wc -l docs/proactive-agent-stability-audit.md
```

Optional smoke (starts servers — stop before commit if not needed):

```bash
# Terminal A
npm run agent:server
# Terminal B
AGENT_RUNS_PROXY_URL=http://127.0.0.1:8788 npm run ingest:server
# Terminal C
curl -s "http://127.0.0.1:8787/api/health" | head -c 500
curl -s "http://127.0.0.1:8788/api/health-agent"
# stop: pkill -f "uvicorn agent_runs_app|ingestion-server"
```

---

## 15. Pass log

| Pass | Date | Outcome |
|------|------|---------|
| 01/40 | 2026-05-27 | Architecture audit doc created |
| 02/40 | 2026-05-27 | `proactive_store` persistence hardening + validate script |
| 03/40 | 2026-05-27 | Config validation (store/api/TS) |
| 04/40 | 2026-05-27 | Dispatch idempotency + batch transitions |
| 05/40 | 2026-05-27 | `proactive_workspace` discovery sync hardening |
| 06/40 | 2026-05-27 | Discovery scan boundaries + `validate_proactive_discovery_scan.py` |
| 07/40 | 2026-05-27 | Explicit candidate scoring + `validate_proactive_candidate_score.py` |
| 08/40 | 2026-05-27 | Candidate dedupe policy + `validate_proactive_candidate_dedupe.py` |
| 09/40 | 2026-05-27 | Structured validation detection + `validate_proactive_validation_detect.py` |
| 10/40 | 2026-05-27 | Materialize state machine + `validate_proactive_materialize.py` |
| 11/40 | 2026-05-27 | Cancel/timeout execution control + `validate_proactive_execution_control.py` |
| 12/40 | 2026-05-27 | No-patch vs crash failure metadata + `validate_proactive_no_patch_failure.py` |
| 13/40 | 2026-05-27 | Review-ready artifact gates + `validate_proactive_review_ready.py` |
| 14/40 | 2026-05-27 | Proactive approval hardening + `validate_proactive_approval.py` |
| 15/40 | 2026-05-27 | Dismiss flow + `validate_proactive_dismiss.py` + `proactiveDismiss.test.ts` |
| 16/40 | 2026-05-27 | `summarize_status` reliability + `validate_proactive_status_summary.py` |
| 17/40 | 2026-05-27 | API errors/auth + `validate_proactive_api.py` + `proactiveApiErrors.test.ts` |
| 18/40 | 2026-05-27 | Node proactive shim/proxy parity + `validate_proactive_node_shim.mjs` |
| 19/40 | 2026-05-27 | OpenDevin fallback hardening + `validate_proactive_opendevin_fallback.py` |
| 20/40 | 2026-05-27 | Sandbox policy enforcement + `validate_proactive_sandbox_policy.py` |
| 21/40 | 2026-05-27 | Proactive branch naming + `validate_proactive_branch_name.py` |
| 22/40 | 2026-05-27 | AI console logs + `validate_proactive_ai_console.py` |
| 23/40 | 2026-05-27 | Storage retention/cleanup + `validate_proactive_retention.py` |
| 24/40 | 2026-05-27 | Core unittest suite (`server/tests/test_proactive_*.py`) |
| 25/40 | 2026-05-27 | FastAPI proactive API routes + `validate_proactive_api_routes.py` |
| 26/40 | 2026-05-27 | TS client contracts + `proactiveNormalize.ts` + Vitest |
| 27/40 | 2026-05-27 | AgentRunsPanel polling stability + `agentOpsPolling.ts` |
| 28/40 | 2026-05-27 | Agent Ops health diagnostics + `agent_ops_health` |
| 29/40 | 2026-05-27 | Synthetic proactive issues + `validate_proactive_synthetic_issue.py` |
| 30/40 | 2026-05-27 | Manifest/graph `contextHints` normalization + selection influence + contract tests |
| 31/40 | 2026-05-27 | Linked-run validation artifacts + `validate_proactive_linked_run.py` |
| 32/40 | 2026-05-27 | Policy violation visibility + approval gating + `validate_proactive_policy_visibility.py` |
| 33/40 | 2026-05-27 | `local://` workspace hardening + `validate_proactive_local_repo.py` |
| 34/40 | 2026-05-27 | `githubToken` transient sync only + `validate_proactive_github_token.py` |
| 35/40 | 2026-05-27 | Cron/daily dispatch runbook + skipped response contract + `validate_proactive_dispatch_skipped.py` |
| 36/40 | 2026-05-27 | Discovery dry-run fixture + `validate_proactive_discovery_fixture.py` |
| 37/40 | 2026-05-27 | Failure-mode recovery + `validate_proactive_failure_recovery.py` |
| 38/40 | 2026-05-27 | `verify_proactive_stability.py` + `npm run verify:proactive` backend gate |
| 39/40 | 2026-05-27 | Full backend audit; §13 checklist; `.gitignore` ops dir; failure_recovery flake fix |
| 40/40 | 2026-05-27 | Final gate: `verify:proactive` + `npm run build`; secrets scan clean; §16 signed off |

---

## 16. Pass 40 regression sign-off

**Date:** 2026-05-27 · **Result:** PASS

```bash
npm run verify:proactive          # exit 0
npm run build                     # exit 0, vite production build
cd server && python3 verify_proactive_stability.py   # compile 75 files + 30 validators + 50 unittest
```

| Check | Result |
|-------|--------|
| `verify:proactive` | PASS |
| `npm run build` | PASS (`dist/` produced) |
| Python compile (gate) | 75 files |
| Validator smokes | 30/30 |
| Unittest `test_proactive_*` | 50 run, 41 pass, 9 skipped (no FastAPI in default env) |
| Node shim | 9/9 |
| Vitest proactive client | 10 files, 41 tests |
| Secrets in changed files | None (only `TEST_TOKEN_PLACEHOLDER` / redaction fixtures) |
| `server/.proactive-agent-ops/` | Gitignored; local ops only — do not commit |

Optional (venv + `pip install -r server/requirements.txt`):

```bash
cd server && python3 verify_proactive_stability.py --with-api-routes
```

**Pass 39 recorded (2026-05-27):** `verify:proactive` without `--with-api-routes`.
