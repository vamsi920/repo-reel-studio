#!/bin/zsh
# Waits for round-v3 generation on :8013, then exports, measures and runs the docs reader.
cd "$(dirname "$0")"
until [ $(./status.sh 8013 | grep -cE "completed|failed") -ge 3 ]; do sleep 30; done
./status.sh 8013
python3 export.py ours-v3 && python3 metrics.py neodevex-v3 ours-v3
for r in ky flask hono; do ./run.sh $r neodevex-v3 wiki 3; done
echo GEN+WIKI DONE
