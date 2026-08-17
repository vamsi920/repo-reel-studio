#!/bin/sh
set -eu

mkdir -p /data/agent-runs /data/proactive

# Persist agent run JSON across ECS task restarts (EFS mount at /data).
if [ ! -e /app/server/.agent-runs ]; then
  ln -sfn /data/agent-runs /app/server/.agent-runs
fi

export PROACTIVE_STORE_ROOT="${PROACTIVE_STORE_ROOT:-/data/proactive}"

exec "$@"
