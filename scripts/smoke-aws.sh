#!/usr/bin/env bash
# Post-deploy smoke checks. Usage:
#   ./scripts/smoke-aws.sh https://api.example.com
set -euo pipefail

API_BASE="${1:-}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 <api-base-url>" >&2
  echo "Example: $0 https://api.example.com" >&2
  exit 1
fi

API_BASE="${API_BASE%/}"

echo "==> GET $API_BASE/api/health"
health="$(curl -fsS "$API_BASE/api/health")"
echo "$health" | python3 -m json.tool

echo "$health" | python3 -c "
import json, sys
data = json.load(sys.stdin)
status = data.get('status')
assert status in ('ok', 'degraded'), f'unexpected status: {status}'
agent = data.get('agentRuns') or {}
if not agent.get('agentReachable'):
    raise SystemExit('FAIL: agentRuns.agentReachable is false')
print('OK: /api/health')
"

echo "==> GET $API_BASE/api/health-agent"
agent_health="$(curl -fsS "$API_BASE/api/health-agent")"
echo "$agent_health" | python3 -m json.tool

echo "$agent_health" | python3 -c "
import json, sys
data = json.load(sys.stdin)
assert data.get('status') == 'ok', data
print('OK: /api/health-agent')
"

echo "All smoke checks passed."
