#!/bin/zsh
# Starts the KT (DeepWiki) service for benchmarking: start-kt.sh <port> <logfile>
cd "$(dirname "$0")/../../../vendor/deepwiki-open"
KEY=$(grep '^VITE_GEMINI_API_KEY=' ../../.env | cut -d= -f2- | tr -d '"')
GOOGLE_API_KEY="$KEY" NODE_ENV=production DEEPWIKI_EMBEDDER_TYPE=google PORT=$1 \
  DEEPWIKI_WIKI_PAGE_CONCURRENCY=4 DEEPWIKI_MAX_CONCURRENT_WIKI_TASKS=3 \
  nohup .venv/bin/python -m api.main > "$2" 2>&1 &
