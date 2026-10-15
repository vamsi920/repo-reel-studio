#!/bin/zsh
# status.sh <repo> <port>
typeset -A T=(ky github_sindresorhus_ky_e0fcf780de2bd69af2528e4b7b87ccae6bb727b1 flask github_pallets_flask_258d68b6ff5e2244386540f48b48bab90d6ab827 hono github_honojs_hono_24547a6ed5e175f9326063efb657540162287973)
curl -s -m 10 localhost:$2/wiki/tasks/${T[$1]} | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('repo'),d.get('status'),d.get('pages_done'),'/',d.get('pages_total'),d.get('error'))" 2>/dev/null || echo "$1 unreachable"
