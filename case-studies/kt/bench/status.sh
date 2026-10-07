#!/bin/zsh
for t in github_sindresorhus_ky_e0fcf780de2bd69af2528e4b7b87ccae6bb727b1 github_pallets_flask_258d68b6ff5e2244386540f48b48bab90d6ab827 github_honojs_hono_24547a6ed5e175f9326063efb657540162287973; do
  curl -s -m 10 localhost:$1/wiki/tasks/$t | python3 -c "import sys,json;d=json.load(sys.stdin);u=d.get('usage') or {};print(d.get('repo'),d.get('status'),d.get('pages_done'),'/',d.get('pages_total'),'\$',u.get('total_cost_usd'),d.get('error'))" 2>/dev/null || echo "$t unreachable"
done
