#!/usr/bin/env bash
# Push secrets to SSM (run after terraform apply, before ECS tasks need real keys).
# Usage:
#   export GITHUB_TOKEN=ghp_...
#   export GEMINI_API_KEY=...
#   export GOOGLE_TTS_API_KEY=...
#   export GITHUB_WEBHOOK_SECRET=optional
#   ./scripts/set-aws-secrets.sh
set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"
AWS_REGION="${AWS_REGION:-us-east-1}"
PREFIX="${SSM_PREFIX:-/gitflick/prod}"

put() {
  local name="$1" val="$2"
  [[ -z "$val" ]] && return 0
  aws ssm put-parameter --region "$AWS_REGION" --name "$PREFIX/$name" \
    --type SecureString --value "$val" --overwrite >/dev/null
  echo "  set $PREFIX/$name"
}

echo "==> SSM secrets ($PREFIX)"
put github_token "${GITHUB_TOKEN:-}"
put gemini_api_key "${GEMINI_API_KEY:-${VITE_GEMINI_API_KEY:-}}"
put google_tts_api_key "${GOOGLE_TTS_API_KEY:-${VITE_GOOGLE_TTS_API_KEY:-}}"
put github_webhook_secret "${GITHUB_WEBHOOK_SECRET:-}"
put proactive_cron_token "${PROACTIVE_CRON_TOKEN:-}"
echo "Done. Redeploy ECS if tasks already running: ./scripts/deploy-aws.sh --skip-infra"
