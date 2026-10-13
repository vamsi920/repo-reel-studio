"""
Token benchmark for NeoDevEx agent work.

Runs real tasks on a copy of the automation-bench fixture with the same
OpenHands SDK version the agent-server runs (1.42.1), building the agent from
the agent settings the app itself sends (dumped by dump-app-context.test.ts),
and records the provider-reported token usage and cost of every run.

    python run_bench.py --variant base --tasks T1,T2 --reps 3

Variants read their agent settings from out/<variant>-agent-settings.json and
their automation prompt tail from out/<variant>-automation-tail.txt, both
produced from the app's own code, so each variant is exactly what the app
would send.

The Gemini key is read from the repository's .env (VITE_GEMINI_API_KEY) and
never printed or written anywhere.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")

from openhands.sdk import Conversation, OpenHandsAgentSettings  # noqa: E402
from openhands.tools.preset.default import register_default_tools  # noqa: E402
import openhands.tools.task  # noqa: E402,F401  (registers task_tool_set)

register_default_tools(enable_browser=False)

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
FIXTURE = REPO_ROOT / "case-studies/automations/.work/automation-bench"
OUT = HERE / "out"
RESULTS = OUT / "results.jsonl"
MODEL = os.environ.get("BENCH_MODEL", "gemini/gemini-2.5-flash")
MAX_ITERATIONS = 60


def gemini_key() -> str:
    for line in (REPO_ROOT / ".env").read_text().splitlines():
        if line.startswith("VITE_GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("VITE_GEMINI_API_KEY missing from .env")


# ── Tasks ────────────────────────────────────────────────────────────────────

PR_DIFF = """diff --git a/src/cart.js b/src/cart.js
--- a/src/cart.js
+++ b/src/cart.js
@@ -17,5 +17,13 @@ export function totalWithDiscount(items, percent) {
 /** Free shipping at or above $50. */
 export function shippingCents(items) {
   return subtotal(items) > 5000 ? 0 : 499;
 }
+
+/** Average price per unit across the cart, in cents. */
+export function averageUnitPriceCents(items) {
+  const units = items.reduce((n, item) => n + item.quantity, 0);
+  return Math.round(subtotal(items) / items.length);
+}
"""

ISSUE = """# Discount codes make orders free

Reported by support, 3 customers this week.

A customer with a $50.00 cart applied code SAVE10 (10% off) and was charged
$0.00. Expected total: $45.00. Happens for every percentage code.
"""

DRY_RUN = (
    "\n\nThis is a dry run on a local checkout with no GitHub remote: do not "
    "push, open pull requests or post comments. Write what you would have "
    "posted to the file named below instead, and skip any setup step that "
    "needs GitHub."
)


def run_tests(workdir: Path, pattern: str = "test/*.test.js") -> bool:
    out = subprocess.run(
        f"node --test {pattern}", shell=True, cwd=workdir, capture_output=True
    )
    return out.returncode == 0


def git_changed(workdir: Path) -> list[str]:
    out = subprocess.run(
        ["git", "status", "--porcelain"], cwd=workdir, capture_output=True, text=True
    )
    return [line[3:] for line in out.stdout.splitlines()]


def read(workdir: Path, name: str) -> str:
    path = workdir / name
    return path.read_text().lower() if path.exists() else ""


TASKS = {
    "T1": {
        "kind": "chat",
        "label": "Fix the failing tests",
        "prompt": "The test suite fails. Find the bugs in src/cart.js, fix them, "
        "and run `npm test` until it passes.",
        "check": lambda w, final: run_tests(w),
    },
    "T2": {
        "kind": "chat",
        "label": "Answer a code question",
        "prompt": "Which functions in src/cart.js are buggy, and why? Do not "
        "change any files.",
        "check": lambda w, final: "totalwithdiscount" in final.lower()
        and "shippingcents" in final.lower()
        and not [f for f in git_changed(w) if f.startswith("src/")],
    },
    "T3": {
        "kind": "automation",
        "label": "Review a pull request",
        "prompt": "Review the pull request in PR.diff against this repository "
        "and write your review comment to REVIEW.md." + DRY_RUN,
        "setup": lambda w: (w / "PR.diff").write_text(PR_DIFF),
        # The new function divides by the number of lines, not units.
        # Names the new function or its divisor, and says units/quantity.
        "check": lambda w, final: any(
            k in read(w, "REVIEW.md") for k in ("averageunitpricecents", "items.length")
        )
        and any(k in read(w, "REVIEW.md") for k in ("units", "quantity")),
    },
    "T4": {
        "kind": "automation",
        "label": "Triage a bug report",
        "prompt": "Triage the bug report in ISSUE.md: find the root cause in "
        "this repository and write your triage comment to TRIAGE.md." + DRY_RUN,
        "setup": lambda w: (w / "ISSUE.md").write_text(ISSUE),
        "check": lambda w, final: "totalwithdiscount" in read(w, "TRIAGE.md")
        and "100" in read(w, "TRIAGE.md"),
    },
    "T5": {
        "kind": "chat",
        "label": "Add a feature with a test",
        "prompt": "Add an exported function taxCents(items, ratePercent) to "
        "src/cart.js that returns the tax on the subtotal in cents, rounded "
        "to the nearest cent, and add a test for it in "
        "test/tax.test.js. Run that test.",
        "check": lambda w, final: (w / "test/tax.test.js").exists()
        and run_tests(w, "test/tax.test.js")
        and subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                "import {taxCents} from './src/cart.js';"
                "const v=taxCents([{priceCents:999,quantity:1}],8.25);"
                "process.exit(v===82?0:1)",
            ],
            cwd=w,
        ).returncode
        == 0,
    },
}


# ── Running ──────────────────────────────────────────────────────────────────


def make_workdir() -> Path:
    workdir = Path(tempfile.mkdtemp(prefix="token-bench-"))
    shutil.copytree(
        FIXTURE,
        workdir,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns(".git", "node_modules"),
    )
    template_modules = OUT / "node_modules"
    if not template_modules.exists():
        subprocess.run(
            ["npm", "install", "--no-audit", "--no-fund", "--silent"],
            cwd=workdir,
            check=True,
        )
        shutil.copytree(workdir / "node_modules", template_modules)
    else:
        shutil.copytree(template_modules, workdir / "node_modules")
    for cmd in (
        ["git", "init", "-q"],
        ["git", "add", "-A"],
        ["git", "-c", "user.email=b@b", "-c", "user.name=bench", "commit", "-qm", "base"],
    ):
        subprocess.run(cmd, cwd=workdir, check=True)
    (workdir / ".gitignore").write_text("node_modules\n")
    return workdir


def final_agent_text(conversation) -> str:
    for event in reversed(list(conversation.state.events)):
        if type(event).__name__ == "MessageEvent" and getattr(event, "source", "") == "agent":
            return "\n".join(
                getattr(part, "text", "") for part in event.llm_message.content
            )
    return ""


def run_one(task_id: str, variant: str, rep: int, key: str) -> dict:
    task = TASKS[task_id]
    settings = json.loads((OUT / f"{variant}-agent-settings.json").read_text())
    settings["llm"] = {"model": MODEL, "api_key": key, "stream": False}
    if os.environ.get("BENCH_LOG_COMPLETIONS"):
        settings["llm"]["log_completions"] = True
        settings["llm"]["log_completions_folder"] = os.environ["BENCH_LOG_COMPLETIONS"]
    # The browser tool needs a local Chromium; both variants run without it.
    settings["tools"] = [t for t in settings["tools"] if t["name"] != "browser_tool_set"]
    agent = OpenHandsAgentSettings.model_validate(settings).create_agent()

    workdir = make_workdir()
    if "setup" in task:
        task["setup"](workdir)
        subprocess.run(["git", "add", "-A"], cwd=workdir)
        subprocess.run(
            ["git", "-c", "user.email=b@b", "-c", "user.name=bench", "commit", "-qm", "task"],
            cwd=workdir,
        )
    prompt = task["prompt"]
    if task["kind"] == "automation":
        prompt += "\n\n" + (OUT / f"{variant}-automation-tail.txt").read_text()

    conversation = Conversation(
        agent=agent,
        workspace=str(workdir),
        visualizer=None,
        max_iteration_per_run=MAX_ITERATIONS,
    )
    started = time.time()
    error = None
    try:
        conversation.send_message(prompt)
        conversation.run()
    except Exception as exc:  # recorded, never raised: one bad run must not stop the batch
        error = f"{type(exc).__name__}: {str(exc)[:300]}"
    elapsed = time.time() - started

    metrics = conversation.conversation_stats.get_combined_metrics()
    usage = metrics.accumulated_token_usage
    final = final_agent_text(conversation)
    try:
        success = bool(task["check"](workdir, final))
    except Exception:
        success = False
    record = {
        "task": task_id,
        "kind": task["kind"],
        "variant": variant,
        "rep": rep,
        "model": MODEL,
        "success": success,
        "error": error,
        "llm_calls": len(metrics.token_usages),
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "reasoning_tokens": usage.reasoning_tokens if usage else 0,
        "cache_read_tokens": usage.cache_read_tokens if usage else 0,
        "first_call_prompt_tokens": metrics.token_usages[0].prompt_tokens
        if metrics.token_usages
        else 0,
        "cost_usd": metrics.accumulated_cost,
        "seconds": round(elapsed, 1),
        "final_message_chars": len(final),
        "final_message": final[:4000],
        "artifacts": {
            name: read(workdir, name)[:4000]
            for name in ("REVIEW.md", "TRIAGE.md")
            if (workdir / name).exists()
        },
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    conversation.close()
    shutil.rmtree(workdir, ignore_errors=True)
    return record


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--variant", required=True, help="comma-separated; runs are interleaved"
    )
    parser.add_argument("--tasks", default=",".join(TASKS))
    parser.add_argument("--reps", type=int, default=1)
    args = parser.parse_args()
    key = gemini_key()
    OUT.mkdir(exist_ok=True)
    # Interleave variants so provider-side prompt caching and time-of-day
    # load cannot favour whichever variant runs last.
    # Resume: a run already recorded for (task, variant, rep) is not redone.
    done = set()
    if RESULTS.exists():
        for line in RESULTS.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                done.add((r["task"], r["variant"], r["rep"]))
    for rep in range(args.reps):
        for task_id in args.tasks.split(","):
          for variant in args.variant.split(","):
            if (task_id, variant, rep) in done:
                continue
            record = run_one(task_id, variant, rep, key)
            with RESULTS.open("a") as fh:
                fh.write(json.dumps(record) + "\n")
            print(
                f"{record['variant']:>8} {task_id} rep{rep} "
                f"ok={record['success']} calls={record['llm_calls']} "
                f"in={record['prompt_tokens']} out={record['completion_tokens']} "
                f"think={record['reasoning_tokens']} "
                f"${record['cost_usd']:.4f} {record['seconds']}s"
                + (f" ERR {record['error']}" if record["error"] else ""),
                flush=True,
            )


if __name__ == "__main__":
    main()
