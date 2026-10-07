#!/bin/zsh
# Finishes every answer set for round v3; each answer.py call resumes where it stopped.
cd "$(dirname "$0")"
( for r in ky flask hono; do DW_URL=http://localhost:8014 ./run.sh $r neodevex-v3 ask 2; done ) > ../.work/log.v3ask 2>&1 &
( ./run.sh hono devin ask 2; for r in ky flask hono; do ./run.sh $r devin wiki 2; done ) > ../.work/log.devin 2>&1 &
( for r in flask hono; do ./run.sh $r neodevex-v3 wiki 2; done ) > ../.work/log.v3wiki 2>&1 &
wait
echo ALL DONE
