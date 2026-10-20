"""
Mutation grading for the test-writing tasks (F2, H2, K2).

A test is only worth something if it fails when the behaviour it claims to
check breaks. For each test file (ours or Devin's) this:
  1. copies it into a fresh clone of the pinned repository and runs it --
     it must pass on the real code;
  2. applies each mutation below (one at a time) to the library source and
     runs the test again -- a good test fails ("kills" the mutant).

    CHAT_BENCH_TEMPLATES=... python grade_tests.py --task F2 --file path/to/test_file

Prints JSON: {"passes_on_real_code": bool, "mutants_killed": n, "mutants": m, "details": [...]}
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TASKS = {t["id"]: t for t in json.loads((HERE / "tasks.json").read_text())["tasks"]}

# (description, file, exact text to replace, replacement)
MUTATIONS = {
    "F2": [
        (
            "teardown_request runs in registration order, not reversed",
            "src/flask/app.py",
            "for func in reversed(self.teardown_request_funcs[name]):",
            "for func in self.teardown_request_funcs[name]:",
        ),
        (
            "teardown_request functions receive None instead of the exception",
            "src/flask/app.py",
            "                    with collect_errors:\n                        self.ensure_sync(func)(exc)\n\n        with collect_errors:\n            request_tearing_down",
            "                    with collect_errors:\n                        self.ensure_sync(func)(None)\n\n        with collect_errors:\n            request_tearing_down",
        ),
        (
            "an error in one teardown_request stops the rest",
            "src/flask/app.py",
            "                    with collect_errors:\n                        self.ensure_sync(func)(exc)\n\n        with collect_errors:\n            request_tearing_down",
            "                    self.ensure_sync(func)(exc)\n\n        with collect_errors:\n            request_tearing_down",
        ),
    ],
    "H2": [
        (
            "no fallback: UnsupportedPathError is re-thrown",
            "src/router/smart-router/router.ts",
            "        if (e instanceof UnsupportedPathError) {\n          continue\n        }",
            "        if (e instanceof UnsupportedPathError && false) {\n          continue\n        }",
        ),
        (
            "router name is not updated after selection",
            "src/router/smart-router/router.ts",
            "    this.name = `SmartRouter + ${this.activeRouter.name}`",
            "    this.name = 'SmartRouter'",
        ),
        (
            "adding a route after the first request is silently accepted",
            "src/router/smart-router/router.ts",
            "    if (!this.#routes) {\n      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT)\n    }\n\n    this.#routes.push",
            "    if (!this.#routes) {\n      return\n    }\n\n    this.#routes.push",
        ),
    ],
    "K2": [
        (
            "an HTTP-date Retry-After waits 2 s instead of its real (past) time",
            "source/core/Ky.ts",
            "after = Date.parse(retryAfter) - Date.now();",
            "after = 2000;",
        ),
        (
            "maxRetryAfter does not clamp the Retry-After wait",
            "source/core/Ky.ts",
            "				return Math.min(this.#options.retry.maxRetryAfter, after);",
            "				return after;",
        ),
        (
            "RateLimit-Reset is not used as a fallback",
            "source/core/Ky.ts",
            "				?? error.response.headers.get('RateLimit-Reset')\n",
            "",
        ),
    ],
}

COMMANDS = {
    "flask": lambda f: [".venv/bin/python", "-m", "pytest", "-q", "-p", "no:cacheprovider", f],
    "hono": lambda f: ["npx", "vitest", "--run", "--coverage.enabled=false", f],
    "ky": lambda f: ["npx", "ava", f],
}


def run(workdir: Path, repo: str, test_file: str) -> tuple[bool, str]:
    proc = subprocess.run(
        COMMANDS[repo](test_file), cwd=workdir, capture_output=True, text=True, timeout=600
    )
    return proc.returncode == 0, (proc.stdout + proc.stderr)[-1500:]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True)
    parser.add_argument("--file", required=True, help="the agent's test file")
    args = parser.parse_args()
    task = TASKS[args.task]
    templates = Path(os.environ["CHAT_BENCH_TEMPLATES"])
    content = Path(args.file).read_text()

    def fresh() -> Path:
        workdir = Path(tempfile.mkdtemp(prefix=f"grade-{args.task}-"))
        workdir.rmdir()
        subprocess.run(["cp", "-cR", str(templates / task["repo"]), str(workdir)], check=True)
        (workdir / task["test_file"]).write_text(content)
        return workdir

    workdir = fresh()
    ok, log = run(workdir, task["repo"], task["test_file"])
    shutil.rmtree(workdir, ignore_errors=True)
    result = {"passes_on_real_code": ok, "baseline_log": log if not ok else "", "details": []}
    killed = 0
    for description, path, old, new in MUTATIONS[args.task]:
        workdir = fresh()
        source = (workdir / path).read_text()
        if old not in source:
            raise SystemExit(f"mutation anchor not found: {description}")
        (workdir / path).write_text(source.replace(old, new, 1))
        mutant_passed, _ = run(workdir, task["repo"], task["test_file"])
        shutil.rmtree(workdir, ignore_errors=True)
        killed += int(not mutant_passed)
        result["details"].append({"mutation": description, "killed": not mutant_passed})
    result["mutants_killed"] = killed
    result["mutants"] = len(MUTATIONS[args.task])
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
