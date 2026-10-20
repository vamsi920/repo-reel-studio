"""
Mutation-grades every test file not graded yet: our runs (out/neodevex*-runs.jsonl)
and Devin's (out/tests/devin-*.{py,ts}). Appends to out/test-grades.json.

    CHAT_BENCH_TEMPLATES=... python grade_all.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
GRADES = OUT / "test-grades.json"


def jobs():
    for path in sorted(OUT.glob("neodevex*-runs.jsonl")) + sorted((OUT / "probe").glob("*.jsonl")):
        if "rules-v1" in path.name:
            continue
        for line in path.read_text().splitlines():
            r = json.loads(line)
            if r["kind"] != "tests":
                continue
            ext = ".py" if r["task"] == "F2" else ".ts"
            dest = OUT / "tests" / f"neodevex-{r['variant']}-{r['task']}-rep{r['rep']}{ext}"
            if r.get("test_file_content"):
                dest.write_text(r["test_file_content"])
            yield {
                "task": r["task"], "agent": "neodevex", "variant": r["variant"], "rep": r["rep"],
                "file": dest if r.get("test_file_content") else None,
                "changed_files": r.get("changed_files", []),
            }
    for dest in sorted((OUT / "tests").glob("devin-*")):
        yield {"task": dest.stem.split("-")[1], "agent": "devin", "variant": "devin", "rep": 0,
               "file": dest, "changed_files": []}


def grade(job):
    base = {k: v for k, v in job.items() if k != "file"}
    if job["file"] is None:
        return {**base, "file_written": False, "passes_on_real_code": False, "mutants_killed": 0,
                "killed": []}
    proc = subprocess.run([sys.executable, str(HERE / "grade_tests.py"), "--task", job["task"],
                           "--file", str(job["file"])], capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"grader failed for {job['file']}: {proc.stderr[-800:]}")
    result = json.loads(proc.stdout)
    return {**base, "file_written": True, "passes_on_real_code": result["passes_on_real_code"],
            "mutants_killed": result["mutants_killed"],
            "killed": [d["killed"] for d in result["details"]],
            "baseline_log": result.get("baseline_log", "")[-600:]}


def main() -> None:
    grades = json.loads(GRADES.read_text()) if GRADES.exists() else []
    done = {(g["task"], g["variant"], g["rep"]) for g in grades}
    todo = [j for j in jobs() if (j["task"], j["variant"], j["rep"]) not in done]
    with ThreadPoolExecutor(4) as pool:
        for g in pool.map(grade, todo):
            grades.append(g)
            GRADES.write_text(json.dumps(grades, indent=2))
            print(g["task"], g["variant"], g["rep"], "real-pass" if g["passes_on_real_code"] else "REAL-FAIL",
                  f"{g['mutants_killed']}/3", flush=True)


if __name__ == "__main__":
    main()
