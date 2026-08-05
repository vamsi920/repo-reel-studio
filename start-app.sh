#!/usr/bin/env bash
# Start the full GitFlick / Repo Reel Studio stack (UI + all backend services).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -f "$ROOT/.env" ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +o allexport
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is required. Install from https://nodejs.org/"
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "📦 node_modules missing — run: npm install"
  exit 1
fi

AGENT_API_PORT="${AGENT_API_PORT:-8788}"
REQUIREMENTS_API_PORT="${REQUIREMENTS_API_PORT:-8790}"
INGEST_PORT="${PORT:-8787}"
VITE_PORT="${VITE_PORT:-8080}"
AGENT_RUNS_PROXY_URL="${AGENT_RUNS_PROXY_URL:-http://127.0.0.1:${AGENT_API_PORT}}"

export AGENT_API_PORT REQUIREMENTS_API_PORT AGENT_RUNS_PROXY_URL

echo ""
echo "🚀 Starting GitFlick full stack"
echo "   UI (Vite):        http://localhost:${VITE_PORT}"
echo "   Ingest API:       http://localhost:${INGEST_PORT}/api/health"
echo "   Agent Ops API:    http://localhost:${AGENT_API_PORT}/api/health-agent"
echo "   Requirements API: http://localhost:${REQUIREMENTS_API_PORT}/api/requirements/health"
echo ""
echo "   Graphify ingest:  ${USE_GRAPHIFY:-on by default} (set USE_GRAPHIFY=false to disable)"
echo "   Press Ctrl+C to stop all services."
echo ""

exec npx concurrently \
  --kill-others-on-fail \
  -n "AGENT,REQS,INGEST,VITE" \
  -c "green,yellow,cyan,magenta" \
  "npm run agent:server" \
  "npm run requirements:server" \
  "bash -lc 'sleep 2 && AGENT_RUNS_PROXY_URL=${AGENT_RUNS_PROXY_URL} PORT=${INGEST_PORT} exec node server/ingestion-server.mjs'" \
  "bash -lc 'sleep 1 && npm run dev'"
