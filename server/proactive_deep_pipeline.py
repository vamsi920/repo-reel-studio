"""
Proactive deep-work pipeline.

Turns a selected candidate into a *strong* change through an explicit, rigorous
sequence — Research → Brainstorm → Patch → Test (loop) → Verify — and only marks a
candidate PR-ready when validations actually pass.

This module is intentionally decoupled and pure: the heavy operations (generating a
patch, running tests) are injected as callables, so the engine is fully unit-testable
without a sandbox, an LLM, or the network. It wraps whichever executor is active
(deterministic legacy or LLM/OpenDevin) and adds the orchestration + strict green-gate
on top.

Design contract
---------------
patch_and_test(approach) -> dict with:
    {
      "patch": str,                  # unified diff produced for this approach ("" if none)
      "validation": {"overallStatus": "passed|partial|failed|not_run", "commands": [...]},
      "changedFiles": [ ... ],
      "policyViolations": [str, ...],
      "blocked": bool,
      "reason": str | None,
    }
The engine never executes anything itself; it drives the loop and records the journey.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

# Bounded so a stuck candidate can't loop forever. Each attempt is a distinct,
# brainstormed approach — not a blind retry of the same patch.
DEFAULT_MAX_FIX_ATTEMPTS = 3
MIN_FIX_ATTEMPTS = 1
MAX_FIX_ATTEMPTS = 6


def max_fix_attempts() -> int:
    raw = os.getenv("PROACTIVE_MAX_FIX_ATTEMPTS", "").strip()
    if not raw:
        return DEFAULT_MAX_FIX_ATTEMPTS
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_FIX_ATTEMPTS
    return max(MIN_FIX_ATTEMPTS, min(MAX_FIX_ATTEMPTS, value))


# --------------------------------------------------------------------------- #
# Stage 1 — Research
# --------------------------------------------------------------------------- #

@dataclass
class ResearchBrief:
    target_file: str
    category: str
    summary: str
    related_files: list[str] = field(default_factory=list)
    existing_tests: list[str] = field(default_factory=list)
    validation_commands: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    risk_notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "targetFile": self.target_file,
            "category": self.category,
            "summary": self.summary,
            "relatedFiles": self.related_files,
            "existingTests": self.existing_tests,
            "validationCommands": self.validation_commands,
            "evidence": self.evidence,
            "riskNotes": self.risk_notes,
        }


def build_research_brief(
    *,
    issue: dict[str, Any],
    repo_context: dict[str, Any],
    validation_profile: Optional[dict[str, Any]] = None,
) -> ResearchBrief:
    """Deterministically assemble a deep-context brief from already-collected repo data."""
    target = str(issue.get("targetFile") or issue.get("filePath") or repo_context.get("primaryFile") or "")
    category = str(issue.get("category") or issue.get("type") or "improvement")

    related = _unique_strings(
        list(repo_context.get("relatedFiles") or [])
        + list(repo_context.get("neighbors") or [])
        + list(repo_context.get("imports") or [])
    )
    related = [f for f in related if f and f != target][:8]

    tests = _unique_strings(repo_context.get("testFiles") or repo_context.get("existingTests") or [])[:6]

    validation_cmds = _unique_strings(
        (validation_profile or {}).get("commands")
        or repo_context.get("validationCommands")
        or []
    )[:6]

    evidence = _unique_strings(issue.get("evidence") or repo_context.get("evidence") or [])[:8]

    risk_notes: list[str] = []
    if not tests:
        risk_notes.append("No neighboring tests detected — add or extend coverage so the change is provable.")
    if category in {"perf", "bug"}:
        risk_notes.append("Behavioural change: verify no regression in adjacent call sites before opening a PR.")
    if len(related) >= 4:
        risk_notes.append(f"High fan-in: {len(related)} related files — keep the change surface minimal.")

    summary = (
        f"Targeting {target or 'the repository'} for a {category} change. "
        f"{len(related)} related file(s) and {len(tests)} test file(s) in scope."
    )

    return ResearchBrief(
        target_file=target,
        category=category,
        summary=summary,
        related_files=related,
        existing_tests=tests,
        validation_commands=validation_cmds,
        evidence=evidence,
        risk_notes=risk_notes,
    )


# --------------------------------------------------------------------------- #
# Stage 2 — Brainstorm (multiple approaches, ranked)
# --------------------------------------------------------------------------- #

@dataclass
class Approach:
    id: str
    title: str
    strategy: str
    rationale: str
    score: float
    risk: str  # low | medium | high

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "strategy": self.strategy,
            "rationale": self.rationale,
            "score": round(self.score, 3),
            "risk": self.risk,
        }


def generate_approaches(issue: dict[str, Any], brief: ResearchBrief) -> list[Approach]:
    """Produce several distinct strategies, ranked best-first. The deep-fix loop tries
    them in order, testing each — so 'brainstorm then patch then test again' is real."""
    category = brief.category
    has_tests = bool(brief.existing_tests)
    target = brief.target_file or "the target module"

    catalog: list[Approach] = []

    if category in {"bug", "improvement"} and "TODO" not in (issue.get("title") or "").upper():
        catalog.append(Approach(
            id="minimal-fix",
            title="Minimal, surgical fix",
            strategy="minimal",
            rationale=f"Make the smallest correct change in {target} that resolves the issue without touching neighbors.",
            score=0.92 if has_tests else 0.78,
            risk="low",
        ))

    if has_tests:
        catalog.append(Approach(
            id="test-first",
            title="Test-first: extend coverage, then fix",
            strategy="test_first",
            rationale="Add/extend a failing test that captures the issue, then make it pass — proves the fix.",
            score=0.95,
            risk="low",
        ))
    else:
        catalog.append(Approach(
            id="add-coverage",
            title="Add coverage alongside the fix",
            strategy="add_coverage",
            rationale=f"No nearby tests exist for {target}; introduce a focused test so the change is verifiable.",
            score=0.85,
            risk="medium",
        ))

    if category == "perf":
        catalog.append(Approach(
            id="lifecycle-guard",
            title="Add lifecycle cleanup / guard",
            strategy="lifecycle",
            rationale="Ensure async/lifecycle primitives are cleaned up to remove leaks and stale work.",
            score=0.88,
            risk="medium",
        ))

    catalog.append(Approach(
        id="refactor-extract",
        title="Refactor + extract for clarity",
        strategy="refactor",
        rationale=f"Restructure {target} to make the fix obvious and reduce future risk.",
        score=0.70,
        risk="high",
    ))

    # Stable, deterministic best-first ordering.
    catalog.sort(key=lambda a: (-a.score, a.id))
    return catalog


def select_best_approach(approaches: list[Approach]) -> Optional[Approach]:
    return approaches[0] if approaches else None


# --------------------------------------------------------------------------- #
# Stage 4/5 — strict green gate
# --------------------------------------------------------------------------- #

def evaluate_pr_ready(
    validation_report: dict[str, Any],
    policy_violations: Optional[list[str]],
    patch_text: Optional[str],
) -> dict[str, Any]:
    """A candidate is PR-ready only when there is a real patch, validations passed, and
    there are no policy violations. This is the gate that stops weak/dummy PRs."""
    has_patch = bool((patch_text or "").strip())
    status = str((validation_report or {}).get("overallStatus") or "not_run")
    validations_passed = status == "passed"
    no_violations = not (policy_violations or [])

    ready = has_patch and validations_passed and no_violations
    reasons: list[str] = []
    if not has_patch:
        reasons.append("No patch was produced.")
    if not validations_passed:
        reasons.append(f"Validations did not fully pass (status: {status}).")
    if not no_violations:
        reasons.append(f"{len(policy_violations or [])} policy violation(s) present.")

    return {
        "ready": ready,
        "hasPatch": has_patch,
        "validationsPassed": validations_passed,
        "validationStatus": status,
        "policyClean": no_violations,
        "reasons": reasons or ["All gates passed — ready to open a pull request."],
    }


# --------------------------------------------------------------------------- #
# The deep fix loop
# --------------------------------------------------------------------------- #

@dataclass
class AttemptRecord:
    index: int
    approach: dict[str, Any]
    validation_status: str
    pr_ready: dict[str, Any]
    patch_present: bool
    blocked: bool
    reason: Optional[str]
    changed_files: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "approach": self.approach,
            "validationStatus": self.validation_status,
            "prReady": self.pr_ready,
            "patchPresent": self.patch_present,
            "blocked": self.blocked,
            "reason": self.reason,
            "changedFiles": self.changed_files,
        }


def run_deep_fix_loop(
    approaches: list[Approach],
    patch_and_test: Callable[[Approach], dict[str, Any]],
    *,
    max_attempts: Optional[int] = None,
    on_event: Optional[Callable[[str, str, str, str], None]] = None,
) -> dict[str, Any]:
    """Try ranked approaches one at a time, testing each, until one is fully green
    (or attempts are exhausted). Returns the journey of attempts and the winner.

    on_event(stage, title, detail, level) is an optional progress sink (UI/timeline).
    """
    limit = max_attempts if max_attempts is not None else max_fix_attempts()
    attempts: list[AttemptRecord] = []
    winner: Optional[dict[str, Any]] = None

    def emit(stage: str, title: str, detail: str, level: str = "info") -> None:
        if on_event:
            try:
                on_event(stage, title, detail, level)
            except Exception:
                pass  # progress reporting must never break the loop

    for index, approach in enumerate(approaches[:limit], start=1):
        emit("patch", f"Attempt {index}: {approach.title}", approach.rationale, "info")
        try:
            outcome = patch_and_test(approach) or {}
        except Exception as exc:  # one bad approach should not abort the whole loop
            emit("patch", f"Attempt {index} errored", str(exc), "warning")
            attempts.append(AttemptRecord(
                index=index, approach=approach.to_dict(), validation_status="error",
                pr_ready=evaluate_pr_ready({}, None, None), patch_present=False,
                blocked=True, reason=str(exc), changed_files=0,
            ))
            continue

        validation = outcome.get("validation") or {}
        patch_text = outcome.get("patch") or ""
        violations = outcome.get("policyViolations") or []
        pr_ready = evaluate_pr_ready(validation, violations, patch_text)

        record = AttemptRecord(
            index=index,
            approach=approach.to_dict(),
            validation_status=str(validation.get("overallStatus") or "not_run"),
            pr_ready=pr_ready,
            patch_present=bool(patch_text.strip()),
            blocked=bool(outcome.get("blocked")),
            reason=outcome.get("reason"),
            changed_files=len(outcome.get("changedFiles") or []),
        )
        attempts.append(record)

        emit(
            "test",
            f"Attempt {index} tested: {record.validation_status}",
            "; ".join(pr_ready["reasons"]),
            "info" if pr_ready["ready"] else "warning",
        )

        if pr_ready["ready"]:
            winner = {"attempt": index, "approach": approach.to_dict(), "outcome": outcome, "prReady": pr_ready}
            emit("verify", "Green build reached", f"Approach '{approach.title}' passed every gate.", "success")
            break

    if winner is None:
        emit(
            "verify",
            "No fully green approach",
            f"Tried {len(attempts)} approach(es); none passed every gate. Not opening a PR.",
            "warning",
        )

    return {
        "attempts": [a.to_dict() for a in attempts],
        "winner": winner,
        "prReady": bool(winner),
        "attemptsRun": len(attempts),
        "maxAttempts": limit,
    }


# --------------------------------------------------------------------------- #
# Journey artifact (consumed by the UI)
# --------------------------------------------------------------------------- #

def build_journey(
    *,
    brief: ResearchBrief,
    approaches: list[Approach],
    loop_result: dict[str, Any],
) -> dict[str, Any]:
    winner = loop_result.get("winner")
    pr_ready = bool(loop_result.get("prReady"))

    stages = [
        {"key": "research", "label": "Research", "status": "done",
         "detail": brief.summary},
        {"key": "brainstorm", "label": "Brainstorm", "status": "done",
         "detail": f"Considered {len(approaches)} approach(es); ranked best-first."},
        {"key": "patch", "label": "Patch", "status": "done" if loop_result.get("attemptsRun") else "skipped",
         "detail": f"{loop_result.get('attemptsRun', 0)} attempt(s)."},
        {"key": "test", "label": "Test loop", "status": "done" if loop_result.get("attemptsRun") else "skipped",
         "detail": _attempts_summary(loop_result)},
        {"key": "verify", "label": "Verify", "status": "done" if pr_ready else "failed",
         "detail": "All gates green — ready for PR." if pr_ready else "Did not reach a fully green build."},
    ]

    return {
        "version": 1,
        "prReady": pr_ready,
        "research": brief.to_dict(),
        "approaches": [a.to_dict() for a in approaches],
        "selected": (winner or {}).get("approach") if winner else (approaches[0].to_dict() if approaches else None),
        "attempts": loop_result.get("attempts", []),
        "attemptsRun": loop_result.get("attemptsRun", 0),
        "maxAttempts": loop_result.get("maxAttempts", 0),
        "stages": stages,
    }


def _attempts_summary(loop_result: dict[str, Any]) -> str:
    attempts = loop_result.get("attempts", [])
    if not attempts:
        return "No attempts run."
    passed = sum(1 for a in attempts if a.get("validationStatus") == "passed")
    return f"{len(attempts)} attempt(s), {passed} fully green."


def _unique_strings(values: Any) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values or []:
        text = str(value).strip()
        if text and text not in seen:
            seen.add(text)
            out.append(text)
    return out
