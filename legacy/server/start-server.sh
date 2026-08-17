#!/bin/bash
set -euo pipefail

# Activate virtual environment and start the ingestion server
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# Load .env for Python
if [ -f "$REPO_ROOT/.env" ]; then
    set -o allexport
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +o allexport
fi

# Prefer Python 3.10+ (gitingest requires it). Fall back to python3.
PYTHON=""
for p in python3.12 python3.11 python3.10 python3; do
    if command -v "$p" &>/dev/null && "$p" -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
        PYTHON="$p"
        break
    fi
done
if [ -z "$PYTHON" ]; then
    echo "❌ Python 3.10+ required (gitingest uses modern typing). Install with: brew install python@3.12"
    exit 1
fi
echo "   Using: $($PYTHON --version)"

if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Creating one..."
    "$PYTHON" -m venv venv
    source venv/bin/activate
    echo "📦 Installing dependencies..."
    pip install -r server/requirements.txt
else
    source venv/bin/activate
fi

# ── GitNexus pre-flight check ─────────────────────────────────────────────
# Verify Node.js is available (needed for npx gitnexus analyze)
if command -v node &>/dev/null; then
    echo "✅ [GitNexus] Node.js available: $(node --version)"
else
    echo "⚠️  [GitNexus] Node.js not found — graph indexing will be skipped."
    echo "   Install Node.js to enable GitNexus graph analysis."
fi
echo ""

echo "🚀 Starting ingestion server..."
"$PYTHON" server/ingestion-server.py
