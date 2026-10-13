"""
Summarise out/results.jsonl: per task and variant, the median tokens and cost
per run, pass rate, and the saving of each variant against `today`.

    python summarize.py [--baseline today] [--json out/summary.json]
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


def median(values):
    return statistics.median(values) if values else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", default="today")
    parser.add_argument("--results", default=str(HERE / "out/results.jsonl"))
    parser.add_argument("--json", default=str(HERE / "out/summary.json"))
    args = parser.parse_args()

    rows = [json.loads(line) for line in Path(args.results).read_text().splitlines() if line.strip()]
    groups = defaultdict(list)
    for row in rows:
        groups[(row["task"], row["variant"])].append(row)

    tasks = sorted({t for t, _ in groups})
    variants = sorted({v for _, v in groups}, key=lambda v: (v != args.baseline, v))
    summary = {"tasks": {}, "totals": {}}
    totals = defaultdict(lambda: defaultdict(float))

    print(f"{'task':4} {'variant':10} {'n':>2} {'pass':>5} {'calls':>5} {'input':>8} {'output':>7} {'think':>6} {'total':>8} {'cost':>8}")
    for task in tasks:
        summary["tasks"][task] = {}
        for variant in variants:
            runs = groups.get((task, variant), [])
            if not runs:
                continue
            stats = {
                "runs": len(runs),
                "pass_rate": sum(r["success"] for r in runs) / len(runs),
                "llm_calls": median([r["llm_calls"] for r in runs]),
                "input_tokens": median([r["prompt_tokens"] for r in runs]),
                "output_tokens": median([r["completion_tokens"] for r in runs]),
                "reasoning_tokens": median([r["reasoning_tokens"] for r in runs]),
                "total_tokens": median([r["prompt_tokens"] + r["completion_tokens"] for r in runs]),
                "cost_usd": median([r["cost_usd"] for r in runs]),
                "first_call_input": median([r["first_call_prompt_tokens"] for r in runs]),
                "mean_total_tokens": statistics.mean(
                    r["prompt_tokens"] + r["completion_tokens"] for r in runs
                ),
                "mean_cost_usd": statistics.mean(r["cost_usd"] for r in runs),
            }
            summary["tasks"][task][variant] = stats
            for key in ("total_tokens", "cost_usd", "mean_total_tokens", "mean_cost_usd"):
                totals[variant][key] += stats[key]
            totals[variant]["passes"] += sum(r["success"] for r in runs)
            totals[variant]["runs"] += len(runs)
            print(
                f"{task:4} {variant:10} {stats['runs']:>2} {stats['pass_rate']:>5.0%} "
                f"{stats['llm_calls']:>5} {stats['input_tokens']:>8.0f} {stats['output_tokens']:>7.0f} "
                f"{stats['reasoning_tokens']:>6.0f} {stats['total_tokens']:>8.0f} ${stats['cost_usd']:>7.4f}"
            )

    base = totals.get(args.baseline)
    print()
    for variant in variants:
        t = totals[variant]
        line = {
            "sum_median_tokens": t["total_tokens"],
            "sum_median_cost_usd": round(t["cost_usd"], 5),
            "sum_mean_tokens": t["mean_total_tokens"],
            "sum_mean_cost_usd": round(t["mean_cost_usd"], 5),
            "passes": int(t["passes"]),
            "runs": int(t["runs"]),
        }
        if base and variant != args.baseline:
            line["token_saving"] = 1 - t["total_tokens"] / base["total_tokens"]
            line["cost_saving"] = 1 - t["cost_usd"] / base["cost_usd"]
            line["mean_token_saving"] = 1 - t["mean_total_tokens"] / base["mean_total_tokens"]
            line["mean_cost_saving"] = 1 - t["mean_cost_usd"] / base["mean_cost_usd"]
        summary["totals"][variant] = line
        print(variant, json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in line.items()}))
    Path(args.json).write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
