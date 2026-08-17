#!/usr/bin/env python3
"""
Validator for the proactive deep-work pipeline (pure, no sandbox/LLM/network).

Run: python3 server/validate_proactive_deep_pipeline.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from proactive_deep_pipeline import (  # noqa: E402
    build_journey,
    build_research_brief,
    evaluate_pr_ready,
    generate_approaches,
    run_deep_fix_loop,
    select_best_approach,
)

PASS = 0
FAIL = 0


def check(name: str, cond: bool) -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name}")


def main() -> int:
    issue = {"title": "Resolve FIXME in src/auth/token.ts", "category": "bug", "targetFile": "src/auth/token.ts",
             "evidence": ["token.ts contains a FIXME", "imported by 5 files"]}
    repo_context = {
        "relatedFiles": ["src/auth/session.ts", "src/auth/token.ts", "src/lib/http.ts"],
        "testFiles": ["src/auth/token.test.ts"],
        "validationCommands": ["npm test", "npm run lint"],
    }

    print("research:")
    brief = build_research_brief(issue=issue, repo_context=repo_context,
                                 validation_profile={"commands": ["npm test"]})
    check("target file captured", brief.target_file == "src/auth/token.ts")
    check("related files exclude target", "src/auth/token.ts" not in brief.related_files)
    check("tests detected", brief.existing_tests == ["src/auth/token.test.ts"])
    check("validation commands present", "npm test" in brief.validation_commands)

    print("brainstorm:")
    approaches = generate_approaches(issue, brief)
    check("multiple approaches generated", len(approaches) >= 2)
    check("ranked best-first (descending score)",
          all(approaches[i].score >= approaches[i + 1].score for i in range(len(approaches) - 1)))
    check("test-first wins when tests exist", select_best_approach(approaches).id == "test-first")

    print("green gate:")
    g_pass = evaluate_pr_ready({"overallStatus": "passed"}, [], "diff --git a b")
    check("passes when green", g_pass["ready"] is True)
    check("blocks with no patch", evaluate_pr_ready({"overallStatus": "passed"}, [], "")["ready"] is False)
    check("blocks when tests fail", evaluate_pr_ready({"overallStatus": "failed"}, [], "diff")["ready"] is False)
    check("blocks on policy violation", evaluate_pr_ready({"overallStatus": "passed"}, ["secret leak"], "diff")["ready"] is False)

    print("deep fix loop — first approach fails, second passes:")
    calls = {"n": 0}

    def patch_and_test(approach):
        calls["n"] += 1
        # First attempt fails validation; second attempt (next approach) passes.
        if calls["n"] == 1:
            return {"patch": "diff a", "validation": {"overallStatus": "failed"},
                    "changedFiles": [{"path": "x"}], "policyViolations": [], "blocked": False}
        return {"patch": "diff b", "validation": {"overallStatus": "passed"},
                "changedFiles": [{"path": "y"}], "policyViolations": [], "blocked": False}

    events = []
    result = run_deep_fix_loop(approaches, patch_and_test, max_attempts=3,
                               on_event=lambda *a: events.append(a))
    check("loop ran 2 attempts before green", result["attemptsRun"] == 2)
    check("loop reports prReady", result["prReady"] is True)
    check("winner is attempt 2", result["winner"]["attempt"] == 2)
    check("events were emitted", len(events) > 0)
    check("verify success event present", any(e[0] == "verify" and e[3] == "success" for e in events))

    print("deep fix loop — nothing ever passes:")
    def always_fail(approach):
        return {"patch": "diff", "validation": {"overallStatus": "failed"},
                "changedFiles": [], "policyViolations": [], "blocked": False}

    res2 = run_deep_fix_loop(approaches, always_fail, max_attempts=3)
    check("no winner when never green", res2["winner"] is None)
    check("prReady False when never green", res2["prReady"] is False)
    check("respects max_attempts", res2["attemptsRun"] <= 3)

    print("deep fix loop — an approach raising does not abort:")
    def explode(approach):
        raise RuntimeError("boom")

    res3 = run_deep_fix_loop(approaches[:2], explode, max_attempts=2)
    check("survives exceptions", res3["attemptsRun"] == 2 and res3["winner"] is None)

    print("journey artifact:")
    journey = build_journey(brief=brief, approaches=approaches, loop_result=result)
    check("journey is pr-ready", journey["prReady"] is True)
    check("journey has 5 stages", len(journey["stages"]) == 5)
    check("verify stage done when green", journey["stages"][-1]["status"] == "done")
    journey_fail = build_journey(brief=brief, approaches=approaches, loop_result=res2)
    check("verify stage failed when not green", journey_fail["stages"][-1]["status"] == "failed")
    check("journey serializable", _json_ok(journey) and _json_ok(journey_fail))

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


def _json_ok(obj) -> bool:
    import json
    try:
        json.dumps(obj)
        return True
    except (TypeError, ValueError):
        return False


if __name__ == "__main__":
    raise SystemExit(main())
