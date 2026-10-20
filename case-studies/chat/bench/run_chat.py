"""
Chat-agent benchmark: NeoDevEx's agent on real tasks in flask, hono and ky.

Each run clones a ready template of the repository (pinned commit, deps
installed) and runs one task with the OpenHands SDK version the agent-server
runs (1.42.1), building the agent from the agent settings the app itself
sends (case-studies/tokens/bench/out/app-agent-settings.json, dumped with the
app's own buildStartConversationRequest). Records provider-reported tokens and
cost, the final answer, and for test-writing tasks the test file written.

    CHAT_BENCH_TEMPLATES=/path/to/templates python run_chat.py --tasks F1,K2 --reps 2

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
TASKS = json.loads((HERE / "tasks.json").read_text())
OUT = HERE / "out"
APP_SETTINGS = REPO_ROOT / "case-studies/tokens/bench/out/app-agent-settings.json"
MAX_ITERATIONS = 80


def gemini_key() -> str:
    for line in (REPO_ROOT / ".env").read_text().splitlines():
        if line.startswith("VITE_GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("VITE_GEMINI_API_KEY missing from .env")


def final_agent_text(conversation) -> str:
    """The agent's answer: its last message, or the message of its finish tool call."""
    for event in reversed(list(conversation.state.events)):
        name = type(event).__name__
        if name == "MessageEvent" and getattr(event, "source", "") == "agent":
            return "\n".join(getattr(p, "text", "") for p in event.llm_message.content)
        if name == "ActionEvent":
            action = getattr(event, "action", None)
            message = getattr(action, "message", None)
            if type(action).__name__.startswith("Finish") and message:
                return str(message)
    return ""


def run_one(
    task: dict, model: str, variant: str, rep: int, key: str, templates: Path, settings_path: Path
) -> dict:
    settings = json.loads(settings_path.read_text())
    settings["llm"] = {"model": model, "api_key": key, "stream": False}
    # The SDK defaults to reasoning_effort="high"; CHAT_BENCH_REASONING_EFFORT
    # measures a lower thinking budget.
    if os.environ.get("CHAT_BENCH_REASONING_EFFORT"):
        settings["llm"]["reasoning_effort"] = os.environ["CHAT_BENCH_REASONING_EFFORT"]
    # The browser tool needs a local Chromium; the tasks do not use it.
    settings["tools"] = [t for t in settings["tools"] if t["name"] != "browser_tool_set"]
    agent = OpenHandsAgentSettings.model_validate(settings).create_agent()

    workdir = Path(tempfile.mkdtemp(prefix=f"chat-{task['id']}-"))
    workdir.rmdir()
    # APFS clone: instant, and the template's installed deps come along.
    subprocess.run(["cp", "-cR", str(templates / task["repo"]), str(workdir)], check=True)

    conversation = Conversation(
        agent=agent, workspace=str(workdir), visualizer=None, max_iteration_per_run=MAX_ITERATIONS
    )
    started = time.time()
    error = None
    try:
        conversation.send_message(task["prompt"])
        conversation.run()
    except Exception as exc:  # recorded, never raised
        error = f"{type(exc).__name__}: {str(exc)[:300]}"
    elapsed = time.time() - started

    metrics = conversation.conversation_stats.get_combined_metrics()
    usage = metrics.accumulated_token_usage
    test_file = task.get("test_file")
    test_path = workdir / test_file if test_file else None
    changed = subprocess.run(
        ["git", "status", "--porcelain"], cwd=workdir, capture_output=True, text=True
    ).stdout.splitlines()
    record = {
        "task": task["id"],
        "repo": task["repo"],
        "kind": task["kind"],
        "agent": "neodevex",
        "variant": variant,
        "model": model,
        "rep": rep,
        "error": error,
        "llm_calls": len(metrics.token_usages),
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "reasoning_tokens": usage.reasoning_tokens if usage else 0,
        "cache_read_tokens": usage.cache_read_tokens if usage else 0,
        "cost_usd": metrics.accumulated_cost,
        "seconds": round(elapsed, 1),
        "final_message": final_agent_text(conversation)[:12000],
        "changed_files": changed,
        "test_file_content": test_path.read_text() if test_path and test_path.exists() else None,
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    conversation.close()
    shutil.rmtree(workdir, ignore_errors=True)
    return record


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tasks", default=",".join(t["id"] for t in TASKS["tasks"]))
    parser.add_argument("--reps", type=int, default=1)
    parser.add_argument("--rep-start", type=int, default=0)
    parser.add_argument("--model", default="gemini/gemini-2.5-flash")
    parser.add_argument("--variant", default="app")
    parser.add_argument("--out", default=str(OUT / "neodevex-runs.jsonl"))
    parser.add_argument(
        "--settings",
        default=str(APP_SETTINGS),
        help="agent settings the app sends (a frozen copy per variant)",
    )
    args = parser.parse_args()
    templates = Path(os.environ["CHAT_BENCH_TEMPLATES"])
    key = gemini_key()
    OUT.mkdir(exist_ok=True)
    by_id = {t["id"]: t for t in TASKS["tasks"]}
    for rep in range(args.rep_start, args.rep_start + args.reps):
        for task_id in args.tasks.split(","):
            record = run_one(
                by_id[task_id], args.model, args.variant, rep, key, templates, Path(args.settings)
            )
            with open(args.out, "a") as fh:
                fh.write(json.dumps(record) + "\n")
            print(
                f"{task_id} {args.variant} rep{rep} calls={record['llm_calls']} "
                f"in={record['prompt_tokens']} out={record['completion_tokens']} "
                f"${record['cost_usd']:.4f} {record['seconds']}s "
                f"test_file={'yes' if record['test_file_content'] else 'no'}"
                + (f" ERR {record['error']}" if record["error"] else ""),
                flush=True,
            )


if __name__ == "__main__":
    main()
