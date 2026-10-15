#!/bin/zsh
# Round-2 speed-up: the chat bench ran T tasks sequentially per (variant, rep).
# For each original process, start one process per not-yet-started task, then
# kill the original as soon as it finishes the task it is on. Results append
# to the same jsonl; run_sdk_bench skips (task, rep) pairs already done.
SH=/Users/vamsi/Desktop/neodevex/repo-reel-studio/case-studies/selfhosted
PY=/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/fca5ba33-b483-489f-861a-40eb26473371/scratchpad/mock-llm-venv/bin/python
export CHAT_BENCH_TEMPLATES=/private/tmp/claude-501/-Users-vamsi-Desktop-neodevex-repo-reel-studio/7e2ad96c-f0d8-4425-92cc-f30093517a99/scratchpad/chat-bench/templates
export OPENHANDS_SUPPRESS_BANNER=1
ALL=(F1 F2 H1 H2 K1 K2)
while read pid study rep; do
  [[ $study == tokens ]] && continue
  rep=${rep#r}; log=$SH/data/runs/$study-r$rep.log
  kill -0 $pid 2>/dev/null || continue
  ndone=$(grep -cE 'rep[0-9] calls=' $log)
  variant=dsv4f-${study#chat-}
  # tasks after the one in progress (index ndone) get their own process
  for ((i=ndone+2; i<=6; i++)); do
    t=${ALL[$i]}
    nohup $PY $SH/harness/run_sdk_bench.py chat --study $study --variant $variant --reps $rep --tasks $t \
      > $SH/data/runs/$study-r$rep-$t.log 2>&1 &
    echo "$! $study r$rep $t" >> $SH/data/runs/pids.txt
    echo "started $study r$rep $t pid $!"
  done
  # stop the original after its current task
  ( while kill -0 $pid 2>/dev/null; do
      [[ $(grep -cE 'rep[0-9] calls=' $log) -gt $ndone ]] && { pkill -P $pid; kill $pid; echo "stopped original $pid ($study r$rep)" >> $SH/data/runs/fanout.log; break; }
      sleep 2
    done ) &
done < $SH/data/runs/pids.txt
