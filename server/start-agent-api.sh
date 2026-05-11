#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

if [ -f "$REPO_ROOT/.env" ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +o allexport
fi

PYTHON=""
for p in python3.12 python3.11 python3.10 python3; do
  if command -v "$p" &>/dev/null && "$p" -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
    PYTHON="$p"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "❌ Python 3.10+ required for Agent Ops. Install with: brew install python@3.12"
  exit 1
fi

if [ ! -d "venv" ]; then
  echo "📦 Creating Python venv for Agent Ops (one-time)..."
  "$PYTHON" -m venv venv
fi

# shellcheck disable=SC1091
source venv/bin/activate

if ! python -c "import fastapi, uvicorn" 2>/dev/null; then
  echo "📦 Installing Agent Ops Python dependencies..."
  pip install -q -r server/requirements.txt || {
    echo "❌ pip install failed. Try: pip install -r server/requirements.txt"
    exit 1
  }
fi

AGENT_API_PORT="${AGENT_API_PORT:-8788}"
export AGENT_API_PORT

echo "🤖 Agent Ops API on http://0.0.0.0:${AGENT_API_PORT} (health: /api/health-agent)"
cd server
exec python -m uvicorn agent_runs_app:app --host 0.0.0.0 --port "$AGENT_API_PORT"
