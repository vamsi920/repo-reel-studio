#!/bin/zsh
# Starts the chat bench (no thinking and thinking-high) and the token bench
# against the gateway: one process per (variant, rep), so 3 reps run in
# parallel per variant. PIDs go to data/runs/pids.txt; kill only those.
set -e
SH=/Users/vamsi/Desktop/neodevex/repo-reel-studio/case-studies/selfhosted
PY=${SDK_PYTHON:-/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/fca5ba33-b483-489f-861a-40eb26473371/scratchpad/mock-llm-venv/bin/python}
export CHAT_BENCH_TEMPLATES=${CHAT_BENCH_TEMPLATES:-/private/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/7e2ad96c-f0d8-4425-92cc-f30093517a99/scratchpad/chat-bench/templates}
export OPENHANDS_SUPPRESS_BANNER=1
mkdir -p $SH/data/runs
for rep in 0 1 2; do
  nohup $PY $SH/harness/run_sdk_bench.py chat --study chat-nothink --variant dsv4f-nothink --reps $rep \
    > $SH/data/runs/chat-nothink-r$rep.log 2>&1 &
  echo "$! chat-nothink r$rep" >> $SH/data/runs/pids.txt
  nohup $PY $SH/harness/run_sdk_bench.py chat --study chat-think --variant dsv4f-think --reps $rep \
    > $SH/data/runs/chat-think-r$rep.log 2>&1 &
  echo "$! chat-think r$rep" >> $SH/data/runs/pids.txt
  nohup $PY $SH/harness/run_sdk_bench.py tokens --study tokens --variant dsv4f --reps $rep \
    > $SH/data/runs/tokens-r$rep.log 2>&1 &
  echo "$! tokens r$rep" >> $SH/data/runs/pids.txt
done
cat $SH/data/runs/pids.txt
