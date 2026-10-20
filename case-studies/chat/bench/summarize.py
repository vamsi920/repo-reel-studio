"""
Aggregates the chat study: explain scores (blind judge), test scores (mutation
grading), cost, model calls and time, per agent/variant. Writes out/summary.json.

A test that fails on the unmodified code scores 0 whatever mutants it "kills".
Changing any file besides the requested test file is a scope violation.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
TEMPLATE_UNTRACKED = ("package-lock.json",)

# Google's paid-tier list prices, USD per 1M tokens (input, output, cached
# input), from ai.google.dev/gemini-api/docs/pricing on 2026-10-13. The SDK's
# litellm does not know the newer models' prices and records $0 for them.
# For 2.5 Flash and Pro this formula reproduces the SDK's own figure exactly.
PRICES = {
    "gemini/gemini-2.5-flash": (0.30, 2.50, 0.03),
    "gemini/gemini-2.5-pro": (1.25, 10.00, 0.125),
    "gemini/gemini-3.8-flash": (0.75, 3.75, 0.075),
    "gemini/gemini-3.1-pro-preview": (2.00, 12.00, 0.20),
    "gemini/gemini-4-argon": (2.00, 10.00, 0.10),
}


def cost(r) -> float:
    if r["model"] not in PRICES:
        return r["cost_usd"]
    i, o, c = PRICES[r["model"]]
    cached = r["cache_read_tokens"]
    return ((r["prompt_tokens"] - cached) * i + cached * c + r["completion_tokens"] * o) / 1e6
TASKS = {t["id"]: t for t in json.loads((HERE / "tasks.json").read_text())["tasks"]}


def mean(xs):
    return round(sum(xs) / len(xs), 3) if xs else None


def main() -> None:
    runs = []
    for path in sorted(OUT.glob("neodevex*-runs.jsonl")) + sorted((OUT / "probe").glob("*.jsonl")):
        if "rules-v1" in path.name:
            continue
        runs += [json.loads(l) for l in path.read_text().splitlines()]
    judge = {(g["task"], g["variant"], g["rep"]): g for g in map(json.loads, (OUT / "judge-grades.jsonl").read_text().splitlines())}
    tests = {(g["task"], g["variant"], g["rep"]): g for g in json.loads((OUT / "test-grades.json").read_text())}
    devin = json.loads((OUT / "devin" / "sessions.json").read_text())["sessions"]

    rows = defaultdict(lambda: defaultdict(list))
    per_task = defaultdict(lambda: defaultdict(list))
    for r in runs:
        v, key = r["variant"], (r["task"], r["variant"], r["rep"])
        agg = rows[v]
        agg["cost"].append(cost(r))
        agg["calls"].append(r["llm_calls"])
        agg["seconds"].append(r["seconds"])
        agg["tokens"].append(r["prompt_tokens"] + r["completion_tokens"])
        if r["kind"] == "explain" and key in judge:
            agg["explain"].append(judge[key]["score"])
            per_task[r["task"]][v].append(judge[key]["score"])
        if r["kind"] == "tests" and key in tests:
            g = tests[key]
            score = g["mutants_killed"] / 3 if g["passes_on_real_code"] else 0.0
            agg["test"].append(score)
            agg["test_written"].append(int(g["file_written"]))
            agg["test_real_pass"].append(int(g["passes_on_real_code"]))
            want = TASKS[r["task"]]["test_file"]
            # hono's template has an untracked package-lock.json from our own
            # npm install, so it shows in every hono run; it is not the agent's.
            extra = [c for c in r["changed_files"] if c.split()[-1] not in (want, *TEMPLATE_UNTRACKED)]
            agg["scope_ok"].append(int(not extra))
            per_task[r["task"]][v].append(score)
    for s in devin:
        key = (s["task"], "devin", 0)
        agg = rows["devin"]
        agg["cost"].append(s["cost_usd"])
        agg["seconds"].append(s["worked_seconds"])
        if key in judge:
            agg["explain"].append(judge[key]["score"])
            per_task[s["task"]]["devin"].append(judge[key]["score"])
        if key in tests:
            g = tests[key]
            score = g["mutants_killed"] / 3 if g["passes_on_real_code"] else 0.0
            agg["test"].append(score)
            agg["test_written"].append(1)
            agg["test_real_pass"].append(int(g["passes_on_real_code"]))
            agg["scope_ok"].append(1)
            per_task[s["task"]]["devin"].append(score)

    summary = {
        "variants": {
            v: {
                "runs": len(a["cost"]),
                "explain_score": mean(a["explain"]),
                "explain_n": len(a["explain"]),
                "test_score": mean(a["test"]),
                "test_n": len(a["test"]),
                "test_written": mean(a["test_written"]),
                "test_passes_real_code": mean(a["test_real_pass"]),
                "scope_ok": mean(a["scope_ok"]),
                "cost_per_task": mean(a["cost"]),
                "calls_per_task": mean(a["calls"]),
                "seconds_per_task": mean(a["seconds"]),
                "tokens_per_task": mean(a["tokens"]),
            }
            for v, a in rows.items()
        },
        "per_task": {t: {v: mean(xs) for v, xs in d.items()} for t, d in sorted(per_task.items())},
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
