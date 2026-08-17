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
  echo "❌ Python 3.10+ required for the Requirements Engine. Install with: brew install python@3.12"
  exit 1
fi

if [ ! -d "venv" ]; then
  echo "📦 Creating Python venv (one-time)..."
  "$PYTHON" -m venv venv
fi

# shellcheck disable=SC1091
source venv/bin/activate

if ! python -c "import fastapi, uvicorn, google.generativeai, pypdf" 2>/dev/null; then
  echo "📦 Installing Requirements Engine Python dependencies..."
  python -m pip install -q -r server/requirements.txt || {
    echo "❌ pip install failed. Try: python -m pip install -r server/requirements.txt"
    exit 1
  }
fi

REQUIREMENTS_API_PORT="${REQUIREMENTS_API_PORT:-8790}"
export REQUIREMENTS_API_PORT

echo "📋 Requirements Engine API on http://0.0.0.0:${REQUIREMENTS_API_PORT} (health: /api/requirements/health)"
cd server
exec python -m uvicorn requirements_engine_app:app --host 0.0.0.0 --port "$REQUIREMENTS_API_PORT"
