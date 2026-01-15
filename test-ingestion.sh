#!/bin/bash

# Test script for verifying ingestion server
echo "🧪 Testing Repo-to-Reel Ingestion Server"
echo "========================================"
echo ""

# Check if server is running
echo "1. Testing health endpoint..."
HEALTH_CHECK=$(curl -s http://localhost:8787/api/health 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ Server is running!"
    echo "   Response: $HEALTH_CHECK"
else
    echo "❌ Server is not responding"
    echo "   Please run: npm run ingest:server"
    exit 1
fi

echo ""
echo "2. Testing repository ingestion..."
echo "   Testing with: facebook/react"

# Test ingestion with a small repo
RESPONSE=$(curl -s -X POST http://localhost:8787/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/facebook/react"}' \
  2>/dev/null)

if echo "$RESPONSE" | grep -q "stats"; then
    echo "✅ Ingestion successful!"
    echo ""
    echo "📊 Stats:"
    echo "$RESPONSE" | grep -o '"includedFiles":[0-9]*' | sed 's/"includedFiles":/   Files included: /'
    echo "$RESPONSE" | grep -o '"skippedFiles":[0-9]*' | sed 's/"skippedFiles":/   Files skipped: /'
    echo "$RESPONSE" | grep -o '"totalBytesFormatted":"[^"]*"' | sed 's/"totalBytesFormatted":"/   Total size: /' | sed 's/"$//'
    echo "$RESPONSE" | grep -o '"durationMs":[0-9]*' | sed 's/"durationMs":/   Duration: /' | awk '{printf "   Duration: %.2fs\n", $2/1000}'
else
    echo "❌ Ingestion failed"
    echo "   Response: $RESPONSE"
    exit 1
fi

echo ""
echo "🎉 All tests passed! Phase 1 is working perfectly."
echo ""
echo "Next steps:"
echo "  1. Start the dev server: npm run dev"
echo "  2. Open http://localhost:8080"
echo "  3. Try pasting a GitHub URL!"
