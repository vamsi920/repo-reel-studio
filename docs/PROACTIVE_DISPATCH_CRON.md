# Proactive daily dispatch (cron)

Proactive scans are **not** scheduled inside the app. `morningDeadline` on config is an operator-facing cutoff (shown in Studio). A **host cron**, GitHub Action, or platform scheduler must call dispatch **before** that time in the repo’s configured timezone.

## Modes

| Mode | Who | Auth | Behavior when `enabled: false` |
|------|-----|------|----------------------------------|
| **Scheduled (cron)** | External job | `Authorization: Bearer <PROACTIVE_CRON_TOKEN>` when env is set on agent API | Stable `status: skipped` — no batch, no workspace sync |
| **Manual (Studio)** | Run now / Dispatch today | Same as other `/api` calls (no cron Bearer today) | Same skipped payload; UI toast explains mode is off |

Cron should **only** target scopes with `enabled: true`. Listing:

```bash
python3 server/proactive_dispatch_cron.py list --enabled-only
```

## HTTP (remote or proxy)

Agent API route: `POST /api/proactive/dispatch-daily`

Body:

```json
{ "repoUrl": "https://github.com/org/repo", "projectId": "optional-studio-project-id" }
```

Shell helper (one repo):

```bash
export PROACTIVE_CRON_TOKEN=your-secret   # required when server sets PROACTIVE_CRON_TOKEN
export PROACTIVE_DISPATCH_API_BASE=http://127.0.0.1:8788   # optional; defaults to AGENT_RUNS_PROXY_URL
chmod +x server/scripts/proactive-dispatch-daily-cron.sh
./server/scripts/proactive-dispatch-daily-cron.sh https://github.com/org/repo my-project-id
```

## In-process (same host as agent API)

No Bearer needed; uses `PROACTIVE_STORE_ROOT` and `dispatch_daily` directly:

```bash
# All enabled scopes
python3 server/proactive_dispatch_cron.py run --all-enabled

# One scope
python3 server/proactive_dispatch_cron.py run \
  --repo-url https://github.com/org/repo --project-id my-project-id

# Dry run
python3 server/proactive_dispatch_cron.py run --all-enabled --dry-run
```

Force HTTP from the helper: add `--http` (then `PROACTIVE_CRON_TOKEN` applies).

## Example crontab

Run at 07:30 local time for every enabled scope (agent API on localhost:8788):

```cron
30 7 * * * cd /path/to/repo-reel-studio && \
  PROACTIVE_STORE_ROOT=/path/to/data \
  /usr/bin/python3 server/proactive_dispatch_cron.py run --all-enabled >> /var/log/proactive-dispatch.log 2>&1
```

Or per-repo HTTP after `list --enabled-only`:

```cron
15 7 * * * /path/to/repo-reel-studio/server/scripts/proactive-dispatch-daily-cron.sh \
  https://github.com/org/repo project-id
```

## Skipped response contract

When proactive mode is disabled, dispatch returns HTTP 200 with a stable body (smoke: `validate_proactive_dispatch_skipped.py`):

- `status`: `"skipped"`
- `code`: `"proactive_disabled"`
- `dispatchMode`: `"disabled"`
- `manualOnly`: `true`
- `batch`: `null`, `ready`: `0`, `candidates`: `[]`
- `reason` / `shortfallReason`: fixed copy (see `server/proactive_dispatch.py`)

## Env vars (names only)

| Variable | Purpose |
|----------|---------|
| `PROACTIVE_CRON_TOKEN` | Bearer secret for `dispatch-daily` when set on server |
| `PROACTIVE_DISPATCH_API_BASE` | Base URL for HTTP cron (default `AGENT_RUNS_PROXY_URL` or `http://127.0.0.1:8788`) |
| `AGENT_RUNS_PROXY_URL` | Ingestion → agent proxy base |
| `PROACTIVE_STORE_ROOT` | Override proactive ops directory (in-process cron) |

Auth on other proactive routes is unchanged. Only `POST /proactive/dispatch-daily` uses `enforce_cron_token`.
