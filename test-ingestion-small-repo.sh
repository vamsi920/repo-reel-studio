#!/usr/bin/env bash
# Quick test with a tiny repo (octocat/Hello-World) to verify the full ingestion flow.
# Run with: ./test-ingestion-small-repo.sh
# Prerequisite: npm run ingest:server (in another terminal)

set -e
REPO_URL="https://github.com/octocat/Hello-World"
echo "🧪 GitFlick ingestion — small repo test"
echo "========================================"
echo ""

echo "1. Health check..."
HEALTH=$(curl -s --max-time 5 http://localhost:8787/api/health 2>/dev/null) || true
if ! echo "$HEALTH" | grep -q "ok"; then
  echo "❌ Server not responding. Start it with: npm run ingest:server"
  exit 1
fi
echo "   ✅ Server OK"
echo ""

echo "2. Ingesting $REPO_URL (small repo, expect ~10s)..."
# Don't let curl timeout exit the script: capture exit code and response
RESPONSE=$(curl -s --max-time 90 -w "\n%{http_code}" -X POST http://localhost:8787/api/ingest \
  -H "Content-Type: application/json" \
  -d "{\"repoUrl\":\"$REPO_URL\"}" 2>/dev/null) || true
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

if echo "$RESPONSE_BODY" | grep -q '"stats"'; then
  echo "   ✅ Ingestion successful"
  echo ""
  echo "📊 Stats:"
  echo "$RESPONSE_BODY" | grep -o '"includedFiles":[0-9]*' | sed 's/"includedFiles":/   Files included: /'
  echo "$RESPONSE_BODY" | grep -o '"skippedFiles":[0-9]*' | sed 's/"skippedFiles":/   Files skipped: /'
  echo "$RESPONSE_BODY" | grep -o '"totalBytesFormatted":"[^"]*"' | sed 's/"totalBytesFormatted":"/   Total size: /' | sed 's/"$//'
  echo "$RESPONSE_BODY" | grep -o '"durationMs":[0-9]*' | sed 's/"durationMs":/   Duration (ms): /'
else
  echo "   ❌ Ingestion failed (HTTP ${HTTP_CODE:-timeout})"
  if [ -z "$RESPONSE_BODY" ]; then
    echo "   No response body (server may have timed out or connection refused)."
  else
    echo "$RESPONSE_BODY" | head -c 600
    echo ""
  fi
  exit 1
fi

echo ""
echo "🎉 Small-repo flow OK. You can run the full UI and try this repo in the app."
