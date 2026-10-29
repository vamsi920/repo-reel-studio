"""
Lines-of-code vs cost benchmark for NeoDevEx agent work.

Runs five coding tasks of increasing size on a copy of the automation-bench
fixture with the same OpenHands SDK version the agent-server runs (1.42.1),
building the agent from the agent settings the app sends (the frozen rules-v5
copy used by the chat study), and records for every run:

- the provider-reported tokens and cost,
- the lines the agent changed, from `git diff --numstat` against the starting
  commit (source and test files counted separately; lockfiles, node_modules and
  the agent's scratch files are excluded),
- whether the result passes hidden checks the agent never sees.

    BENCH_MODEL=gemini/gemini-4-argon python run_lines.py --tasks L1,L2 --reps 3

The Gemini key is read from the repository's .env (VITE_GEMINI_API_KEY) and is
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
SETTINGS = REPO_ROOT / "case-studies/chat/bench/out/settings-rules-v5-caveman.json"
OUT = HERE / "out"
RESULTS = OUT / "results.jsonl"
MODEL = os.environ.get("BENCH_MODEL", "gemini/gemini-4-argon")
# The app sends medium thinking for Gemini frontier models.
REASONING_EFFORT = os.environ.get("BENCH_REASONING_EFFORT", "medium")
MAX_ITERATIONS = 80
NCU_COST_USD = 0.40


def gemini_key() -> str:
    for line in (REPO_ROOT / ".env").read_text().splitlines():
        if line.startswith("VITE_GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("VITE_GEMINI_API_KEY missing from .env")


# ── Hidden checks ────────────────────────────────────────────────────────────


def node_check(workdir: Path, script: str) -> bool:
    """Runs an ES-module snippet in the workdir; exit code 0 means pass."""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=workdir,
        capture_output=True,
        timeout=60,
    )
    return out.returncode == 0


def run_tests(workdir: Path, pattern: str) -> bool:
    out = subprocess.run(
        f"node --test {pattern}", shell=True, cwd=workdir, capture_output=True, timeout=120
    )
    return out.returncode == 0


THROWS = "const throws=(f)=>{try{f();return false}catch{return true}};"

TASKS = {
    "L1": {
        "label": "Fix two bugs",
        "prompt": "The test suite fails. Find the bugs in src/cart.js, fix them, "
        "and run `npm test` until it passes.",
        "check": lambda w: run_tests(w, "test/cart.test.js"),
    },
    "L2": {
        "label": "Add one function with a test",
        "prompt": "Add an exported function taxCents(items, ratePercent) to "
        "src/cart.js that returns the tax on the subtotal in cents, rounded "
        "to the nearest cent, and add a test for it in test/tax.test.js. "
        "Run that test.",
        "check": lambda w: (w / "test/tax.test.js").exists()
        and run_tests(w, "test/tax.test.js")
        and node_check(
            w,
            "import {taxCents} from './src/cart.js';"
            "process.exit(taxCents([{priceCents:999,quantity:1}],8.25)===82?0:1)",
        ),
    },
    "L3": {
        "label": "Add a coupons module",
        "prompt": "Add src/coupons.js exporting parseCoupon(code) and "
        "applyCoupon(items, code). Codes: 'SAVE<n>' is n percent off (n from 1 "
        "to 90), 'FLAT<n>' is n cents off; codes are case-insensitive; any other "
        "code throws an Error. applyCoupon returns the cart subtotal (use "
        "subtotal from src/cart.js) minus the discount, in cents, rounded to the "
        "nearest cent and never below 0. Add tests in test/coupons.test.js and "
        "run them.",
        "check": lambda w: run_tests(w, "test/coupons.test.js")
        and node_check(
            w,
            THROWS + "import {applyCoupon as a} from './src/coupons.js';"
            "const c=[{priceCents:5000,quantity:1}];"
            "const ok=a(c,'save10')===4500&&a(c,'FLAT700')===4300&&a(c,'flat9999')===0"
            "&&throws(()=>a(c,'BOGUS'))&&throws(()=>a(c,'SAVE95'));"
            "process.exit(ok?0:1)",
        ),
    },
    "L4": {
        "label": "Add an inventory class",
        "prompt": "Add src/inventory.js exporting a class Inventory. Methods: "
        "add(sku, qty) adds stock; remove(sku, qty) removes stock and throws an "
        "Error if there is not enough; count(sku) returns the stock (0 for "
        "unknown skus); reserve(lines) takes an array of {sku, quantity} and "
        "removes all of them, or throws and changes nothing if any line lacks "
        "stock; lowStock(threshold) returns the skus whose stock is below "
        "threshold, sorted alphabetically. Quantities must be positive "
        "integers, otherwise throw a TypeError. Add thorough tests in "
        "test/inventory.test.js and run them.",
        "check": lambda w: run_tests(w, "test/inventory.test.js")
        and node_check(
            w,
            THROWS + "import {Inventory} from './src/inventory.js';"
            "const i=new Inventory();i.add('b',5);i.add('a',2);i.add('c',9);"
            "let ok=i.count('zz')===0&&i.count('b')===5;"
            "ok=ok&&throws(()=>i.remove('a',3))&&i.count('a')===2;"
            "ok=ok&&throws(()=>i.reserve([{sku:'b',quantity:1},{sku:'a',quantity:5}]))"
            "&&i.count('b')===5;"
            "i.reserve([{sku:'b',quantity:4},{sku:'c',quantity:1}]);"
            "ok=ok&&i.count('b')===1&&i.count('c')===8;"
            "ok=ok&&JSON.stringify(i.lowStock(3))===JSON.stringify(['a','b']);"
            "let te=false;try{i.add('a',1.5)}catch(e){te=e instanceof TypeError}"
            "let te2=false;try{i.add('a',-1)}catch(e){te2=e instanceof TypeError}"
            "process.exit(ok&&te&&te2?0:1)",
        ),
    },
    "L5": {
        "label": "Build a receipt feature across modules",
        "prompt": "Add src/receipt.js exporting formatReceipt(items, { couponCode, "
        "taxRatePercent }) that returns a plain-text receipt. Each item has "
        "{name, priceCents, quantity}. Print one line per item with its name, "
        "quantity and line total, then lines labelled 'Subtotal', 'Discount' "
        "(only when a coupon is given), 'Tax', 'Shipping' and 'Total'. Money is "
        "shown as dollars with two decimals, like $12.50. Coupons: SAVE<n> is n% "
        "off, FLAT<n> is n cents off, case-insensitive, any other code throws an "
        "Error. Tax applies to the subtotal after the discount, rounded to the "
        "nearest cent. Shipping is free when the discounted subtotal is at least "
        "$50.00, otherwise $4.99. Total = discounted subtotal + tax + shipping. "
        "Put the coupon rules and the money formatting in their own modules "
        "under src/, add tests under test/ covering at least five cases, and "
        "run the new tests.",
        "check": lambda w: node_check(
            w,
            THROWS + "import {formatReceipt as f} from './src/receipt.js';"
            "const items=[{name:'Mug',priceCents:1250,quantity:2},"
            "{name:'Tee',priceCents:3000,quantity:1}];"
            "const a=f(items,{couponCode:'save10',taxRatePercent:8.25});"
            "const b=f(items,{taxRatePercent:8.25});"
            "const ok=a.includes('$55.00')&&a.includes('$4.99')&&a.includes('$58.57')"
            "&&/discount/i.test(a)&&b.includes('$59.54')&&!/discount/i.test(b)"
            "&&throws(()=>f(items,{couponCode:'NOPE',taxRatePercent:8.25}));"
            "process.exit(ok?0:1)",
        ),
    },
}


# ── Measuring lines ──────────────────────────────────────────────────────────

EXCLUDED = ("node_modules/", "package-lock.json", ".gitignore")


def lines_changed(workdir: Path) -> dict:
    """Lines added/deleted against the starting commit, new files included."""
    subprocess.run(["git", "add", "-A"], cwd=workdir, check=True)
    out = subprocess.run(
        ["git", "diff", "--cached", "--numstat", "HEAD"],
        cwd=workdir,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    totals = {"src_added": 0, "src_deleted": 0, "test_added": 0, "test_deleted": 0,
              "other_added": 0, "other_deleted": 0, "files": []}
    for line in out.splitlines():
        added, deleted, path = line.split("\t", 2)
        if added == "-" or path.startswith(EXCLUDED) or path in EXCLUDED:
            continue
        bucket = "src" if path.startswith("src/") else "test" if path.startswith("test/") else "other"
        totals[f"{bucket}_added"] += int(added)
        totals[f"{bucket}_deleted"] += int(deleted)
        totals["files"].append(path)
    return totals


# ── Running ──────────────────────────────────────────────────────────────────


def make_workdir() -> Path:
    workdir = Path(tempfile.mkdtemp(prefix="lines-bench-"))
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
    (workdir / ".gitignore").write_text("node_modules\n")
    for cmd in (
        ["git", "init", "-q"],
        ["git", "add", "-A"],
        ["git", "-c", "user.email=b@b", "-c", "user.name=bench", "commit", "-qm", "base"],
    ):
        subprocess.run(cmd, cwd=workdir, check=True)
    return workdir


def run_one(task_id: str, rep: int, key: str) -> dict:
    task = TASKS[task_id]
    settings = json.loads(SETTINGS.read_text())
    settings["llm"] = {
        "model": MODEL,
        "api_key": key,
        "stream": False,
        "reasoning_effort": REASONING_EFFORT,
    }
    # The browser tool needs a local Chromium; no task here uses it.
    settings["tools"] = [t for t in settings["tools"] if t["name"] != "browser_tool_set"]
    agent = OpenHandsAgentSettings.model_validate(settings).create_agent()

    workdir = make_workdir()
    conversation = Conversation(
        agent=agent,
        workspace=str(workdir),
        visualizer=None,
        max_iteration_per_run=MAX_ITERATIONS,
    )
    started = time.time()
    error = None
    try:
        conversation.send_message(task["prompt"])
        conversation.run()
    except Exception as exc:  # recorded, never raised: one bad run must not stop the batch
        error = f"{type(exc).__name__}: {str(exc)[:300]}"
    elapsed = time.time() - started

    metrics = conversation.conversation_stats.get_combined_metrics()
    usage = metrics.accumulated_token_usage
    try:
        success = bool(task["check"](workdir))
    except Exception:
        success = False
    lines = lines_changed(workdir)
    cost = metrics.accumulated_cost
    record = {
        "task": task_id,
        "label": task["label"],
        "rep": rep,
        "model": MODEL,
        "reasoning_effort": REASONING_EFFORT,
        "success": success,
        "error": error,
        "llm_calls": len(metrics.token_usages),
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "reasoning_tokens": usage.reasoning_tokens if usage else 0,
        "cache_read_tokens": usage.cache_read_tokens if usage else 0,
        "cost_usd": cost,
        "ncu": round(cost / NCU_COST_USD, 4),
        "seconds": round(elapsed, 1),
        **lines,
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    conversation.close()
    shutil.rmtree(workdir, ignore_errors=True)
    return record


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tasks", default=",".join(TASKS))
    parser.add_argument("--reps", type=int, default=1)
    args = parser.parse_args()
    key = gemini_key()
    OUT.mkdir(exist_ok=True)
    # Resume: a run already recorded for (task, model, rep) is not redone.
    done = set()
    if RESULTS.exists():
        for line in RESULTS.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                done.add((r["task"], r["model"], r["rep"]))
    for rep in range(args.reps):
        for task_id in args.tasks.split(","):
            if (task_id, MODEL, rep) in done:
                continue
            record = run_one(task_id, rep, key)
            with RESULTS.open("a") as fh:
                fh.write(json.dumps(record) + "\n")
            print(
                f"{task_id} rep{rep} ok={record['success']} calls={record['llm_calls']} "
                f"+{record['src_added'] + record['test_added']} "
                f"-{record['src_deleted'] + record['test_deleted']} lines "
                f"${record['cost_usd']:.4f} {record['seconds']}s"
                + (f" ERR {record['error']}" if record["error"] else ""),
                flush=True,
            )


if __name__ == "__main__":
    main()
