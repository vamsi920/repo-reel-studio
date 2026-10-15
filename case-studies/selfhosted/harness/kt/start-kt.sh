#!/bin/zsh
# Starts one KT (DeepWiki) service for one repo and one phase, routed through the
# metering gateway with a per-phase/per-repo tag (plus the call kind, see kt_launch.py).
#   start-kt.sh <repo: ky|flask|hono> <phase: gen|ask> <port>
# Env: KT_HOME_ROOT (per-repo HOME dirs khome-<repo>, holding that repo's clone and
# its existing gemini-embedding-001 index), DWVENV (round 1's venv), KT_LOG_DIR.
set -e
repo=$1 phase=$2 port=$3
HERE=${0:A:h}
REPO_ROOT=${HERE:h:h:h:h}
: ${DWVENV:=/private/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/5349578c-0629-4c1e-9576-1e147dc9d821/scratchpad/dwvenv}
: ${KT_HOME_ROOT:?set KT_HOME_ROOT}
: ${KT_LOG_DIR:?set KT_LOG_DIR}
: ${KT_GATEWAY:=http://127.0.0.1:18800}  # override only for a dry run against a mock
cd $REPO_ROOT/vendor/deepwiki-open
KEY=$(grep '^VITE_GEMINI_API_KEY=' $REPO_ROOT/.env | cut -d= -f2- | tr -d '"')
HOME=$KT_HOME_ROOT/khome-$repo GOOGLE_API_KEY="$KEY" NODE_ENV=production DEEPWIKI_EMBEDDER_TYPE=google PORT=$port \
  DEEPWIKI_CONFIG_DIR=$HERE/dwconfig \
  LITELLM_BASE_URL=$KT_GATEWAY/kt__$phase-$repo/v1 LITELLM_API_KEY=gateway KT_TAG_KIND=1 KT_THINKING=0 \
  LOG_FILE_PATH=$KT_LOG_DIR/kt-dsv4f-$phase-$repo-service.log \
  DEEPWIKI_WIKI_PAGE_CONCURRENCY=4 DEEPWIKI_MAX_CONCURRENT_WIKI_TASKS=3 \
  nohup $DWVENV/bin/python $HERE/kt_launch.py > $KT_LOG_DIR/kt-dsv4f-$phase-$repo.out 2>&1 &
echo $! > $KT_LOG_DIR/kt-dsv4f-$phase-$repo.pid
echo "started $repo $phase on :$port pid $(cat $KT_LOG_DIR/kt-dsv4f-$phase-$repo.pid)"
