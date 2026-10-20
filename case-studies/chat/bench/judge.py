"""
Blind checklist judge for the explain tasks (F1, H1, K1).

Gemini 2.5 Pro scores one answer against the task's checklist (checklists.json,
written from the source before any answer was read). The judge is not told
which agent wrote the answer. Its scores are checked against the hand grades
in out/explain-grades.json before they are used (see calibration in the
summary).

    python judge.py            # judges every answer not judged yet
Writes out/judge-grades.jsonl.
"""

from __future__ import annotations

import json
from pathlib import Path

import litellm

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
CHECK = json.loads((HERE / "checklists.json").read_text())
OUT = HERE / "out" / "judge-grades.jsonl"
MODEL = "gemini/gemini-2.5-pro"

PROMPT = """You grade an answer to a question about a codebase against a fixed checklist.
The checklist facts were written from the source code and are correct. Do not use
your own knowledge of the library; judge only whether the answer states each fact.

For each fact give 1 (stated correctly), 0.5 (partly, or vague) or 0 (missing or
stated wrongly). Then list which of the listed wrong claims the answer makes, and
any other clearly false statement about this code (an invented function, header,
option or code path, or a reversed order of events). Do not penalise wrong line
numbers or extra correct detail.

Question:
{question}

Checklist facts:
{facts}

Listed wrong claims:
{wrong}

Answer to grade:
<<<
{answer}
>>>

Reply with JSON only:
{{"facts": [<score per fact, in order>], "wrong_claims": [<short description of each wrong claim made>]}}"""


def key() -> str:
    for line in (REPO_ROOT / ".env").read_text().splitlines():
        if line.startswith("VITE_GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("VITE_GEMINI_API_KEY missing")


def answers():
    tasks = {t["id"]: t for t in json.loads((HERE / "tasks.json").read_text())["tasks"]}
    for path in sorted((HERE / "out").glob("neodevex*-runs.jsonl")) + sorted((HERE / "out" / "probe").glob("*.jsonl")):
        for line in path.read_text().splitlines():
            r = json.loads(line)
            if r["kind"] == "explain":
                variant = "rules-v1" if "rules-v1" in path.name else r["variant"]
                yield r["task"], "neodevex", variant, r["rep"], r["final_message"], tasks[r["task"]]
    for task_id in ("F1", "H1", "K1"):
        devin = HERE / "out" / "devin" / f"{task_id}.md"
        if devin.exists():
            text = "\n".join(l for l in devin.read_text().splitlines() if not l.startswith("<!--"))
            yield task_id, "devin", "devin", 0, text, tasks[task_id]


def main() -> None:
    done = set()
    if OUT.exists():
        for line in OUT.read_text().splitlines():
            g = json.loads(line)
            done.add((g["task"], g["variant"], g["rep"]))
    api_key = key()
    for task_id, agent, variant, rep, answer, task in answers():
        if (task_id, variant, rep) in done:
            continue
        check = CHECK[task_id]
        prompt = PROMPT.format(
            question=task["prompt"],
            facts="\n".join(f"{i + 1}. {f}" for i, f in enumerate(check["facts"])),
            wrong="\n".join(f"- {w}" for w in check["wrong_claims"]),
            answer=answer or "(empty answer)",
        )
        response = litellm.completion(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            api_key=api_key,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)
        facts = sum(float(x) for x in data["facts"])
        wrong = len(data["wrong_claims"])
        total = len(check["facts"])
        record = {
            "task": task_id,
            "agent": agent,
            "variant": variant,
            "rep": rep,
            "facts": facts,
            "wrong": wrong,
            "total": total,
            "score": max(0.0, facts - wrong) / total,
            "per_fact": data["facts"],
            "wrong_claims": data["wrong_claims"],
        }
        with OUT.open("a") as fh:
            fh.write(json.dumps(record) + "\n")
        print(task_id, variant, rep, f"{record['score']:.2f}", data["wrong_claims"][:2], flush=True)


if __name__ == "__main__":
    main()
