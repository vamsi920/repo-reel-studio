#!/bin/zsh
# Submits forced comprehensive wiki generation for one repo on its own service,
# provider litellm / model deepseek-v4-flash (round 1: litellm / qwen3-coder-next).
#   submit.sh <repo> <port>
typeset -A R=(ky sindresorhus/ky:e0fcf780de2bd69af2528e4b7b87ccae6bb727b1 flask pallets/flask:258d68b6ff5e2244386540f48b48bab90d6ab827 hono honojs/hono:24547a6ed5e175f9326063efb657540162287973)
r=${R[$1]}; rp=${r%%:*}; c=${r##*:}
curl -s -m 20 -X POST localhost:$2/wiki/tasks -H 'content-type: application/json' \
  -d "{\"repo_url\":\"https://github.com/$rp\",\"type\":\"github\",\"owner\":\"${rp%%/*}\",\"repo\":\"${rp##*/}\",\"provider\":\"litellm\",\"model\":\"deepseek-v4-flash\",\"commit_sha\":\"$c\",\"comprehensive\":true,\"force\":true}"; echo
