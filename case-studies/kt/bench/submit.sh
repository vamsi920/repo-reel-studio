#!/bin/zsh
# Submits forced comprehensive wiki generation for the three benchmark repos: submit.sh <port>
for r in sindresorhus/ky:e0fcf780de2bd69af2528e4b7b87ccae6bb727b1 pallets/flask:258d68b6ff5e2244386540f48b48bab90d6ab827 honojs/hono:24547a6ed5e175f9326063efb657540162287973; do
  rp=${r%%:*}; c=${r##*:}
  curl -s -m 20 -X POST localhost:$1/wiki/tasks -H 'content-type: application/json' \
    -d "{\"repo_url\":\"https://github.com/$rp\",\"type\":\"github\",\"owner\":\"${rp%%/*}\",\"repo\":\"${rp##*/}\",\"provider\":\"google\",\"model\":\"gemini-2.5-pro\",\"commit_sha\":\"$c\",\"comprehensive\":true,\"force\":true}"; echo
done
