#!/usr/bin/env bash
# POST /api/proactive/dispatch-daily for one repo/project (external cron).
#
# Usage:
#   PROACTIVE_CRON_TOKEN=secret ./server/scripts/proactive-dispatch-daily-cron.sh \
#     https://github.com/org/repo [project-id]
#
# Env:
#   PROACTIVE_DISPATCH_API_BASE  Base URL (default: AGENT_RUNS_PROXY_URL or http://127.0.0.1:8788)
#   PROACTIVE_CRON_TOKEN         Bearer token when the agent API enforces cron auth
#   AGENT_RUNS_PROXY_URL         Fallback base (ingestion proxy → agent API)
#
# Disabled repos: server returns stable status=skipped (no batch). Cron should only
# call enabled scopes — use: python3 server/proactive_dispatch_cron.py list --enabled-only

set -euo pipefail

REPO_URL="${1:-}"
PROJECT_ID="${2:-}"
if [[ -z "${REPO_URL}" ]]; then
  echo "usage: $0 <repoUrl> [projectId]" >&2
  exit 1
fi

BASE="${PROACTIVE_DISPATCH_API_BASE:-${AGENT_RUNS_PROXY_URL:-http://127.0.0.1:8788}}"
BASE="${BASE%/}"
ENDPOINT="${BASE}/api/proactive/dispatch-daily"

export PROJECT_ID="${PROJECT_ID}"
PAYLOAD=$(REPO_URL="${REPO_URL}" PROJECT_ID="${PROJECT_ID}" python3 -c 'import json, os
body = {"repoUrl": os.environ["REPO_URL"]}
project = os.environ.get("PROJECT_ID", "").strip()
if project:
    body["projectId"] = project
print(json.dumps(body))')

AUTH_ARGS=()
if [[ -n "${PROACTIVE_CRON_TOKEN:-}" ]]; then
  AUTH_ARGS=(-H "Authorization: Bearer ${PROACTIVE_CRON_TOKEN}")
fi

curl -fsS -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  "${AUTH_ARGS[@]}" \
  -d "${PAYLOAD}"

echo
