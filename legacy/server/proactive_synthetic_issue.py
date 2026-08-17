from __future__ import annotations

import re
from typing import Any, Optional

from proactive_branch_name import PROACTIVE_ISSUE_PREFIX


def repo_name(repo_url: str) -> str:
    cleaned = (repo_url or "").strip().rstrip("/")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    return cleaned.split("/")[-1] if cleaned else "repository"

MAX_EVIDENCE_LINES = 6
MAX_COMMENT_LINES = 3
MAX_BODY_CHARS = 2800
MAX_VALIDATION_COMMANDS = 3

TYPE_TITLES = {
    "bug": "Fix",
    "perf": "Improve performance in",
    "reliability": "Harden",
    "improvement": "Improve",
}

TYPE_OBJECTIVES = {
    "bug": "Resolve the reported defect with a minimal, reviewable patch and nearby validation.",
    "perf": "Reduce unnecessary work or lifecycle overhead without changing product behavior.",
    "reliability": "Close a reliability gap with defensive handling and focused validation.",
    "improvement": "Apply a small, reviewable improvement scoped to the highlighted area.",
}

SHARED_CONSTRAINTS = [
    "Keep the diff as small as possible; avoid drive-by refactors.",
    "Do not open a pull request or push branches.",
    "Prefer existing repo tooling for validation; do not install new dependencies unless required.",
    "Stay within the focus path unless a one-line import fix is strictly necessary.",
]

TYPE_CONSTRAINTS: dict[str, list[str]] = {
    "bug": [
        "Address the root cause shown in the evidence, not only symptoms.",
        "Add or update a nearby test when a practical harness already exists.",
    ],
    "perf": [
        "Avoid API or UX behavior changes; document any unavoidable tradeoff in the patch summary.",
        "Prefer cleanup, memoization, or scope reduction over speculative micro-optimizations.",
    ],
    "reliability": [
        "Handle failure, cancellation, or stale state explicitly; avoid silent swallowing.",
        "Preserve existing success paths; add guards instead of rewriting modules.",
    ],
    "improvement": [
        "Keep public interfaces stable unless the evidence explicitly requires a signature change.",
        "Favor clarity and maintainability over breadth of change.",
    ],
}


def normalize_candidate_type(value: Any) -> str:
    kind = str(value or "improvement").strip().lower()
    if kind in TYPE_TITLES:
        return kind
    return "improvement"


def candidate_focus_path(candidate: dict[str, Any]) -> str:
    dedupe = str(candidate.get("dedupeKey") or "")
    if ":" in dedupe:
        path = dedupe.split(":", 1)[0].strip()
        if path:
            return path
    title = str(candidate.get("title") or "")
    match = re.search(r"\b(?:in|around|for)\s+([^\s,]+)", title, re.I)
    if match:
        return match.group(1).strip()
    return "repository"


def candidate_blast_radius(candidate: dict[str, Any]) -> tuple[str, str]:
    score = candidate.get("score") or {}
    label = str(score.get("riskLabel") or "medium").strip().lower()
    if label not in {"low", "medium", "high"}:
        label = "medium"
    notes = {
        "low": "Localized change; low chance of cross-module regressions.",
        "medium": "Touches a meaningful module; run standard validation and inspect adjacent callers.",
        "high": "Sensitive or central area; extra review required and keep the patch narrowly scoped.",
    }
    return label, notes[label]


def _trim_evidence_lines(candidate: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for item in candidate.get("evidence") or []:
        text = re.sub(r"\s+", " ", str(item or "")).strip()
        if not text:
            continue
        if text.startswith("Ranking:"):
            continue
        lines.append(text[:220])
        if len(lines) >= MAX_EVIDENCE_LINES:
            break
    return lines


def candidate_validation_focus(candidate: dict[str, Any]) -> list[str]:
    profile = candidate.get("validationProfile") or {}
    commands = profile.get("commands") if isinstance(profile, dict) else {}
    picked: list[str] = []
    if isinstance(commands, dict):
        for bucket in ("test", "lint", "build"):
            values = commands.get(bucket)
            if isinstance(values, list):
                for command in values[:1]:
                    text = str(command or "").strip()
                    if text:
                        picked.append(text)
            if len(picked) >= MAX_VALIDATION_COMMANDS:
                break

    if picked:
        return picked

    for line in _trim_evidence_lines(candidate):
        lowered = line.lower()
        if any(token in lowered for token in ("validation", "pytest", "vitest", "eslint", "npm test", "npm run")):
            picked.append(line[:160])
        if len(picked) >= MAX_VALIDATION_COMMANDS:
            break

    if picked:
        return picked
    return ["Run the repo's existing test/lint command if one is configured."]


def build_issue_title(candidate: dict[str, Any]) -> str:
    kind = normalize_candidate_type(candidate.get("type"))
    focus = candidate_focus_path(candidate)
    verb = TYPE_TITLES[kind]
    base = str(candidate.get("title") or "").strip()
    if base and len(base) <= 120:
        return base[:140]
    return f"{verb} {focus}"[:140]


def build_synthetic_issue_body(candidate: dict[str, Any]) -> str:
    kind = normalize_candidate_type(candidate.get("type"))
    focus = candidate_focus_path(candidate)
    hypothesis = re.sub(r"\s+", " ", str(candidate.get("hypothesis") or "")).strip()
    evidence = _trim_evidence_lines(candidate)
    validation = candidate_validation_focus(candidate)
    blast_label, blast_note = candidate_blast_radius(candidate)

    evidence_lines = (
        [f"- {line}" for line in evidence]
        if evidence
        else ["- No additional evidence captured during discovery."]
    )
    sections = [
        "## Summary",
        hypothesis or TYPE_OBJECTIVES[kind],
        "",
        f"**Candidate type:** {kind}",
        f"**Focus path:** `{focus}`",
        "",
        "## Evidence",
        *evidence_lines,
        "",
        "## Validation focus",
        *[f"- {line}" for line in validation],
        "",
        "## Blast radius",
        f"- Risk level: **{blast_label}** — {blast_note}",
        "",
        "## Constraints",
        *[f"- {line}" for line in SHARED_CONSTRAINTS],
        *[f"- {line}" for line in TYPE_CONSTRAINTS[kind]],
    ]

    body = "\n".join(sections).strip()
    if len(body) > MAX_BODY_CHARS:
        body = body[: MAX_BODY_CHARS - 3].rstrip() + "..."
    return body


def proactive_issue_url(candidate_id: str) -> str:
    token = str(candidate_id or "").strip()
    return f"{PROACTIVE_ISSUE_PREFIX}candidate/{token}"


def build_synthetic_issue(candidate: dict[str, Any]) -> dict[str, Any]:
    kind = normalize_candidate_type(candidate.get("type"))
    evidence = _trim_evidence_lines(candidate)
    return {
        "owner": None,
        "repo": repo_name(candidate.get("repoUrl") or ""),
        "number": None,
        "title": build_issue_title(candidate),
        "body": build_synthetic_issue_body(candidate),
        "state": "open",
        "labels": ["proactive", kind],
        "author": "proactive-agent",
        "htmlUrl": proactive_issue_url(str(candidate.get("id") or "")),
        "comments": [{"author": "proactive-agent", "body": line} for line in evidence[:MAX_COMMENT_LINES]],
    }


def attach_synthetic_issue_to_run(run: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    issue = build_synthetic_issue(candidate)
    run["issue"] = issue
    run["issueUrl"] = proactive_issue_url(str(candidate.get("id") or ""))
    plan = run.setdefault("plan", {})
    plan["summary"] = issue["title"]
    plan["validation_focus"] = candidate_validation_focus(candidate)
    focus = candidate_focus_path(candidate)
    plan["tasks"] = [
        {"title": "Investigate", "detail": str(candidate.get("hypothesis") or issue["title"])[:240]},
        {"title": "Patch", "detail": f"Apply a minimal change scoped to `{focus}`."},
        {"title": "Validate", "detail": plan["validation_focus"][0] if plan.get("validation_focus") else "Run repo validation."},
    ]
    context = run.setdefault("contextHints", {})
    context["focusFiles"] = [focus]
    evidence = _trim_evidence_lines(candidate)
    context["evidenceCount"] = len(evidence)
    context["snippetCount"] = len(evidence)
    return run
