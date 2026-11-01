"""
Aggregates the issue-resolution runs (run_issues.py) per variant: resolved
rate, how often the project's static checks still pass, how often the agent
added tests and updated the docs/changelog a complete pull request would,
plus cost, model calls and time. Writes out/issues-summary.json.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from summarize import cost

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 3) if xs else None


def main() -> None:
    rows = defaultdict(lambda: defaultdict(list))
    per_task = defaultdict(lambda: defaultdict(list))
    for path in sorted(OUT.glob("issues-*-runs.jsonl")):
        for line in path.read_text().splitlines():
            r = json.loads(line)
            agg = rows[r["variant"]]
            agg["resolved"].append(int(r["resolved"]))
            agg["static"].append(int(r.get("static_pass", True)))
            agg["tests_added"].append(int(r["added_tests"]))
            if r.get("docs_updated") is not None:
                agg["docs"].append(int(r["docs_updated"]))
            agg["cost"].append(cost(r))
            agg["calls"].append(r["llm_calls"])
            agg["seconds"].append(r["seconds"])
            agg["tokens"].append(r["prompt_tokens"] + r["completion_tokens"])
            per_task[r["task"]][r["variant"]].append(int(r["resolved"]))
    summary = {
        "variants": {
            v: {
                "runs": len(a["resolved"]),
                "resolved": mean(a["resolved"]),
                "static_checks_pass": mean(a["static"]),
                "tests_added": mean(a["tests_added"]),
                "docs_or_changelog": mean(a["docs"]),
                "cost_per_task": mean(a["cost"]),
                "calls_per_task": mean(a["calls"]),
                "seconds_per_task": mean(a["seconds"]),
                "tokens_per_task": mean(a["tokens"]),
            }
            for v, a in rows.items()
        },
        "per_task_resolved": {t: {v: mean(s) for v, s in vs.items()} for t, vs in sorted(per_task.items())},
    }
    (OUT / "issues-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
