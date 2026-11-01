"""
Issue-resolution benchmark: bug reports and feature requests on flask, hono
and ky, graded by hidden tests (issues.json).

The existing chat study (run_chat.py) only measures explaining code and
writing tests, and both are saturated. Devin is sold on resolving issues, so
this measures that: the agent gets a bug report that names only the symptom,
or a feature spec, in a clone where any planted bug is already committed.
After it finishes, the hidden tests are copied in and run, then the
repository's own related tests. Resolved = both pass.

    CHAT_BENCH_TEMPLATES=/path/to/templates python run_issues.py --variant v6 \
        --settings out/settings-rules-v6.json --tasks FX1,HF1 --reps 1

    python run_issues.py --validate   # hidden tests fail before, pass with hidden/ref patches

Reuses run_chat's agent construction and token accounting.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ISSUES = json.loads((HERE / "issues.json").read_text())["tasks"]
OUT = HERE / "out"

COMMANDS = {
    "flask": lambda files: [".venv/bin/python", "-m", "pytest", "-q", "-p", "no:cacheprovider", *files],
    "hono": lambda files: ["npx", "vitest", "--run", "--coverage.enabled=false", *files],
    "ky": lambda files: ["npx", "ava", *files],
}


def clone(templates: Path, task: dict) -> Path:
    workdir = Path(tempfile.mkdtemp(prefix=f"issue-{task['id']}-"))
    workdir.rmdir()
    subprocess.run(["cp", "-cR", str(templates / task["repo"]), str(workdir)], check=True)
    # An editable install (flask's .venv) records the template's absolute path
    # in its .pth file and script shebangs; without this the clone would run
    # the template's source, not its own.
    venv = workdir / ".venv"
    if venv.is_dir():
        old_root, new_root = str(templates / task["repo"]), str(workdir)
        for f in [*venv.glob("bin/*"), *venv.glob("lib/*/site-packages/*.pth")]:
            if f.is_file() and not f.is_symlink():
                try:
                    text = f.read_text()
                except UnicodeDecodeError:
                    continue
                if old_root in text:
                    f.write_text(text.replace(old_root, new_root))
    for path, old, new in task["plant"]:
        target = workdir / path
        text = target.read_text()
        assert text.count(old) == 1, f"{task['id']}: plant text not unique in {path}"
        target.write_text(text.replace(old, new))
    # Commit everything (plant and the template's own untracked install
    # artefacts) so the agent starts from a clean `git status`/`git diff`.
    git = ["git", "-c", "user.email=bench@neodevex", "-c", "user.name=bench"]
    subprocess.run([*git, "add", "-A"], cwd=workdir, check=True, capture_output=True)
    subprocess.run([*git, "commit", "-qm", "wip", "--allow-empty"], cwd=workdir, check=True)
    return workdir


# The project's own static checks, run on the result. flask: ruff (its
# pre-commit linter) on the files the agent touched; hono and ky: tsc.
STATIC_CHECKS = {
    "flask": lambda files: [".venv/bin/ruff", "check", *[f for f in files if f.endswith(".py")]] if any(f.endswith(".py") for f in files) else None,
    "hono": lambda files: ["npx", "tsc", "--noEmit", "-p", "tsconfig.build.json"],
    "ky": lambda files: ["npx", "tsc", "--noEmit", "-p", "tsconfig.json"],
}


def static_check(workdir: Path, repo: str, files: list[str]) -> tuple[bool, str]:
    cmd = STATIC_CHECKS[repo]([f.split()[-1] for f in files if not f.startswith("D")])
    if cmd is None:
        return True, ""
    proc = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True, timeout=600)
    return proc.returncode == 0, (proc.stdout + proc.stderr)[-1500:]


def docs_updated(task: dict, diff: str, files: list[str]) -> bool | None:
    rule = task.get("docs")
    if not rule:
        return None
    paths = [f.split()[-1] for f in files]
    if any(re.search(rx, p) for rx in rule.get("files", []) for p in paths):
        return True
    return bool(rule.get("diff") and re.search(rule["diff"], diff, re.M))


def run_tests(workdir: Path, repo: str, files: list[str]) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            COMMANDS[repo](files), cwd=workdir, capture_output=True, text=True, timeout=900
        )
    except subprocess.TimeoutExpired:
        return False, "timeout"
    return proc.returncode == 0, (proc.stdout + proc.stderr)[-2500:]


def grade(workdir: Path, task: dict, files: list[str] | None = None) -> dict:
    static_ok, static_out = static_check(workdir, task["repo"], files or [])
    for dest, src in task["hidden"].items():
        shutil.copy(HERE / src, workdir / dest)
    hidden_ok, hidden_out = run_tests(workdir, task["repo"], list(task["hidden"]))
    regression_ok, regression_out = run_tests(workdir, task["repo"], task["regression"])
    return {
        "hidden_pass": hidden_ok,
        "regression_pass": regression_ok,
        "resolved": hidden_ok and regression_ok,
        "static_pass": static_ok,
        "static_out": static_out,
        "hidden_out": hidden_out,
        "regression_out": regression_out,
    }


def agent_diff(workdir: Path) -> tuple[str, list[str]]:
    subprocess.run(["git", "add", "-A"], cwd=workdir, capture_output=True)
    diff = subprocess.run(
        ["git", "diff", "--cached", "HEAD"], cwd=workdir, capture_output=True, text=True
    ).stdout
    files = subprocess.run(
        ["git", "diff", "--cached", "--name-status", "HEAD"], cwd=workdir, capture_output=True, text=True
    ).stdout.splitlines()
    subprocess.run(["git", "reset", "-q"], cwd=workdir, capture_output=True)
    return diff, files


def added_tests(files: list[str]) -> bool:
    return any(re.search(r"(^|/)(tests?/|test_[^/]*\.py$|[^/]*\.test\.tsx?$)", f.split()[-1]) for f in files)


def validate(templates: Path) -> None:
    """Hidden tests must fail on the starting code and pass with the reference fix."""
    ok = True
    for task in ISSUES:
        before = clone(templates, task)
        b = grade(before, task)
        after = clone(templates, task)
        ref = HERE / "hidden" / "ref" / f"{task['id']}.patch"
        subprocess.run(["git", "apply", str(ref)], cwd=after, check=True)
        a = grade(after, task)
        good = (not b["hidden_pass"]) and a["resolved"]
        ok &= good
        print(f"{task['id']}: before hidden={b['hidden_pass']} | ref hidden={a['hidden_pass']} regression={a['regression_pass']} {'OK' if good else 'BAD'}")
        if not good:
            print(a["hidden_out"][-1200:], a["regression_out"][-1200:])
        shutil.rmtree(before, ignore_errors=True)
        shutil.rmtree(after, ignore_errors=True)
    sys.exit(0 if ok else 1)


def regrade(templates: Path, runs: Path) -> None:
    """Re-grade saved runs from their diffs (after grading rules change)."""
    by_id = {t["id"]: t for t in ISSUES}
    records = [json.loads(line) for line in runs.read_text().splitlines()]
    for r in records:
        task = by_id[r["task"]]
        workdir = clone(templates, task)
        patch = workdir / ".agent.patch"
        patch.write_text(r["diff"])
        subprocess.run(["git", "apply", "--whitespace=nowarn", str(patch)], cwd=workdir, check=True)
        patch.unlink()
        r.update(grade(workdir, task, r["changed_files"]))
        r["docs_updated"] = docs_updated(task, r["diff"], r["changed_files"])
        shutil.rmtree(workdir, ignore_errors=True)
        print(r["task"], r["rep"], "resolved", r["resolved"], "static", r["static_pass"], "docs", r["docs_updated"], flush=True)
    runs.write_text("".join(json.dumps(r) + "\n" for r in records))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tasks", default=",".join(t["id"] for t in ISSUES))
    parser.add_argument("--reps", type=int, default=1)
    parser.add_argument("--rep-start", type=int, default=0)
    parser.add_argument("--model", default="gemini/gemini-4-argon")
    parser.add_argument("--variant", default="app")
    parser.add_argument("--settings", default=str(OUT / "settings-current.json"))
    parser.add_argument("--out", default=None)
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--regrade", help="re-grade a runs .jsonl in place from its saved diffs")
    args = parser.parse_args()
    templates = Path(os.environ["CHAT_BENCH_TEMPLATES"])
    if args.validate:
        validate(templates)
    if args.regrade:
        regrade(templates, Path(args.regrade))
        return

    sys.path.insert(0, str(HERE))
    import run_chat  # noqa: E402  (imports the SDK; not needed for --validate)
    from openhands.sdk import Conversation, OpenHandsAgentSettings  # noqa: E402

    key = run_chat.gemini_key()
    out = Path(args.out or OUT / f"issues-{args.variant}-runs.jsonl")
    by_id = {t["id"]: t for t in ISSUES}
    for rep in range(args.rep_start, args.rep_start + args.reps):
        for task_id in args.tasks.split(","):
            task = by_id[task_id]
            settings = json.loads(Path(args.settings).read_text())
            llm = {"model": args.model, "api_key": key, "stream": False}
            # The app sends reasoning_effort with the profile; keep it.
            if settings.get("llm", {}).get("reasoning_effort"):
                llm["reasoning_effort"] = settings["llm"]["reasoning_effort"]
            settings["llm"] = llm
            settings["tools"] = [t for t in settings["tools"] if t["name"] != "browser_tool_set"]
            agent = OpenHandsAgentSettings.model_validate(settings).create_agent()
            workdir = clone(templates, task)
            conversation = Conversation(
                agent=agent, workspace=str(workdir), visualizer=None,
                max_iteration_per_run=run_chat.MAX_ITERATIONS,
            )
            started, error = time.time(), None
            try:
                conversation.send_message(task["prompt"])
                conversation.run()
            except Exception as exc:  # recorded, never raised
                error = f"{type(exc).__name__}: {str(exc)[:300]}"
            elapsed = time.time() - started
            metrics = conversation.conversation_stats.get_combined_metrics()
            usage = metrics.accumulated_token_usage
            final = run_chat.final_agent_text(conversation)
            conversation.close()
            diff, files = agent_diff(workdir)
            result = grade(workdir, task, files)
            record = {
                "task": task_id, "repo": task["repo"], "kind": task["kind"],
                "variant": args.variant, "model": args.model, "rep": rep, "error": error,
                "llm_calls": len(metrics.token_usages),
                "prompt_tokens": usage.prompt_tokens if usage else 0,
                "completion_tokens": usage.completion_tokens if usage else 0,
                "cache_read_tokens": usage.cache_read_tokens if usage else 0,
                "cost_usd": metrics.accumulated_cost,
                "seconds": round(elapsed, 1),
                "changed_files": files,
                "added_tests": added_tests(files),
                "docs_updated": docs_updated(task, diff, files),
                "diff": diff[:40000],
                "final_message": final[:6000],
                **result,
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            shutil.rmtree(workdir, ignore_errors=True)
            with open(out, "a") as fh:
                fh.write(json.dumps(record) + "\n")
            print(
                f"{task_id} {args.variant} rep{rep} resolved={record['resolved']} "
                f"hidden={record['hidden_pass']} regr={record['regression_pass']} "
                f"tests_added={record['added_tests']} calls={record['llm_calls']} "
                f"{record['seconds']}s" + (f" ERR {error}" if error else ""),
                flush=True,
            )


if __name__ == "__main__":
    main()
