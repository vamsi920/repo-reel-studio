"""Run the chat bench or the token bench against the self-hosted model, through
the metering gateway, without editing the shared runners.

    python run_sdk_bench.py chat   --study chat-nothink --variant dsv4f-nothink --reps 0,1,2 [--tasks F1,F2]
    python run_sdk_bench.py tokens --study tokens       --variant dsv4f         --reps 0,1,2 [--tasks T1,T2]

Both runners (case-studies/chat/bench/run_chat.py, case-studies/tokens/bench/run_bench.py)
build the agent from the settings the app sends; only the LLM block is patched:
base_url points at the gateway with a per-run tag (<study>__<task>-r<rep>) so
every model call in gateway/calls.jsonl can be tied to its run, and provider
features vLLM does not serve (prompt-cache flags, reasoning effort) are off.
The gateway applies the study's sampling settings (studies.json).

Runs are appended to the output file one JSON line each; finished
(task, rep) pairs are skipped on a re-run, so the script can be restarted.
"""

import argparse
import fcntl
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path("/Users/vamsi/Desktop/neodevex/repo-reel-studio/case-studies")
GATEWAY = os.environ.get("GATEWAY_URL", "http://127.0.0.1:18800")
MODEL = os.environ.get("BENCH_MODEL", "openai/deepseek-v4-flash")
CURRENT = {"tag": "unset"}


def patch_settings(module):
    original = module.OpenHandsAgentSettings

    class Patched:
        @staticmethod
        def model_validate(settings):
            settings["llm"].update({
                "model": MODEL,
                "base_url": f"{GATEWAY}/{CURRENT['tag']}/v1",
                "api_key": "gateway",
                "caching_prompt": False,
                "reasoning_effort": None,
                "extended_thinking_budget": None,
                "drop_params": True,
                "timeout": 3600,
                "num_retries": 2,
            })
            return original.model_validate(settings)

    module.OpenHandsAgentSettings = Patched


def append(out: Path, record: dict):
    with out.open("a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.write(json.dumps(record) + "\n")
        fcntl.flock(fh, fcntl.LOCK_UN)


def done_pairs(out: Path):
    if not out.exists():
        return set()
    return {(r["task"], r["rep"]) for r in map(json.loads, filter(str.strip, out.read_text().splitlines()))
            if not r.get("error") or "upstream failed" not in (r.get("error") or "")}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("bench", choices=["chat", "tokens"])
    p.add_argument("--study", required=True)
    p.add_argument("--variant", required=True)
    p.add_argument("--reps", default="0,1,2")
    p.add_argument("--tasks", default="")
    p.add_argument("--settings", default="")
    p.add_argument("--out", default="")
    args = p.parse_args()
    os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")

    if args.bench == "chat":
        bench = ROOT / "chat/bench"
        sys.path.insert(0, str(bench)); os.chdir(bench)
        import run_chat as mod
        patch_settings(mod)
        tasks = args.tasks.split(",") if args.tasks else [t["id"] for t in mod.TASKS["tasks"]]
        by_id = {t["id"]: t for t in mod.TASKS["tasks"]}
        settings = Path(args.settings or bench / "out/settings-rules-v4.json")
        out = Path(args.out or bench / f"out/neodevex-{args.variant}-runs.jsonl")
        templates = Path(os.environ["CHAT_BENCH_TEMPLATES"])
        run = lambda t, rep: mod.run_one(by_id[t], MODEL, args.variant, rep, "gateway", templates, settings)
    else:
        bench = ROOT / "tokens/bench"
        sys.path.insert(0, str(bench)); os.chdir(bench)
        import run_bench as mod
        patch_settings(mod)
        tasks = args.tasks.split(",") if args.tasks else list(mod.TASKS)
        sv = args.settings or "neo"
        out = Path(args.out or bench / f"out/{args.variant}-results.jsonl")
        run = lambda t, rep: mod.run_one(t, sv, rep, "gateway")

    done = done_pairs(out)
    for rep in [int(x) for x in args.reps.split(",")]:
        for task in tasks:
            if (task, rep) in done:
                continue
            CURRENT["tag"] = f"{args.study}__{task}-r{rep}"
            t0 = time.time()
            record = run(task, rep)
            record.update(variant=args.variant, study=args.study, gateway_tag=CURRENT["tag"],
                          started_epoch=round(t0, 1), ended_epoch=round(time.time(), 1))
            append(out, record)
            print(f"{task} {args.variant} rep{rep} calls={record.get('llm_calls')} "
                  f"in={record.get('prompt_tokens')} out={record.get('completion_tokens')} "
                  f"{record.get('seconds')}s err={(record.get('error') or '')[:120]}", flush=True)


if __name__ == "__main__":
    main()
