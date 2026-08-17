from __future__ import annotations

import re
from typing import Any, Optional

SELECT_THRESHOLD = 0.62
DEDUPE_STRONG_THRESHOLD = 0.82
MAX_SELECT_TARGET = 6

SIGNAL_WEIGHT = 0.35
VALIDATION_WEIGHT = 0.25
CENTRALITY_WEIGHT = 0.20
RISK_WEIGHT = 0.20
CONTEXT_HINT_BONUS = 0.08  # legacy alias; tiered bonuses live in proactive_context_hints

HIGH_RISK_RE = re.compile(
    r"(^|/)(auth|authentication|security|payment|billing|credential|secret|token|session|login)(/|\.|$)",
    re.I,
)
MEDIUM_RISK_RE = re.compile(
    r"(^|/)(migration|schema|database|db|infra|deploy|terraform|k8s|helm)(/|\.|$)|migration",
    re.I,
)
VALIDATION_TEST_RE = re.compile(r"\b(test|pytest|jest|vitest|spec)\b", re.I)
VALIDATION_LINT_RE = re.compile(r"\b(lint|eslint|ruff|mypy)\b", re.I)
VALIDATION_BUILD_RE = re.compile(r"\b(build|typecheck|compile)\b", re.I)


def classify_path_risk(path: str) -> tuple[float, str, str]:
    """Return (risk component 0-1, label, note). Higher component = safer / lower blast radius."""
    if HIGH_RISK_RE.search(path):
        return (
            0.42,
            "high",
            "High-risk area (auth/security/payment/credentials); extra human review recommended.",
        )
    if MEDIUM_RISK_RE.search(path):
        return (
            0.64,
            "medium",
            "Medium-risk area (migrations/schema/infra); prefer smaller, well-validated changes.",
        )
    return 0.88, "low", "Lower-risk path outside auth/payment/migration hotspots."


def _profile_bucket(profile: dict[str, Any], bucket: str) -> bool:
    commands = profile.get("commands") or {}
    values = commands.get(bucket)
    if isinstance(values, list):
        return bool(values)
    return bool(values)


def score_validation_component(
    has_nearby_test: bool,
    validation_hints: Optional[list[str]] = None,
    validation_profile: Optional[dict[str, Any]] = None,
) -> tuple[float, str]:
    score = 0.58
    notes: list[str] = []
    if has_nearby_test:
        score += 0.18
        notes.append("nearby test/spec detected")

    profile = validation_profile or {}
    overall = profile.get("overall")
    if overall and overall != "none":
        if overall == "strong":
            score += 0.22
            notes.append("strong repo validation profile")
        elif overall == "moderate":
            score += 0.12
            notes.append("moderate repo validation profile")
        elif overall == "weak":
            score += 0.06
            notes.append("python validation markers only")
        if _profile_bucket(profile, "test"):
            score += 0.06
            notes.append("repo test command available")
        if _profile_bucket(profile, "lint"):
            score += 0.05
            notes.append("repo lint command available")
        if _profile_bucket(profile, "build") or _profile_bucket(profile, "typecheck"):
            score += 0.04
            notes.append("repo build/typecheck available")
    else:
        hints = " ".join(validation_hints or [])
        if VALIDATION_TEST_RE.search(hints):
            score += 0.08
            notes.append("repo test command available")
        if VALIDATION_LINT_RE.search(hints):
            score += 0.05
            notes.append("repo lint command available")
        if VALIDATION_BUILD_RE.search(hints):
            score += 0.04
            notes.append("repo build/typecheck available")

    if not notes:
        notes.append("limited validation tooling detected")
    return min(0.95, score), "; ".join(notes)


def score_signal_component(evidence_count: int) -> float:
    return round(min(1.0, 0.45 + 0.12 * max(0, evidence_count)), 3)


def score_centrality_component(centrality: int) -> float:
    return round(min(1.0, centrality / 8), 3)


def compute_candidate_score(
    *,
    path: str,
    evidence_count: int,
    centrality: int,
    has_nearby_test: bool,
    context_hinted: bool = False,
    context_hint_bonus: Optional[float] = None,
    validation_hints: Optional[list[str]] = None,
    validation_profile: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    signal = score_signal_component(evidence_count)
    validation, validation_note = score_validation_component(
        has_nearby_test,
        validation_hints,
        validation_profile,
    )
    central = score_centrality_component(centrality)
    risk, risk_label, risk_note = classify_path_risk(path)
    if context_hint_bonus is not None:
        hint_bonus = max(0.0, min(0.12, float(context_hint_bonus)))
    else:
        hint_bonus = CONTEXT_HINT_BONUS if context_hinted else 0.0
    total = round(
        min(
            1.0,
            signal * SIGNAL_WEIGHT
            + validation * VALIDATION_WEIGHT
            + central * CENTRALITY_WEIGHT
            + risk * RISK_WEIGHT
            + hint_bonus,
        ),
        3,
    )
    summary = (
        f"Ranking: total={total:.3f} signal={signal:.2f} validation={validation:.2f} "
        f"centrality={central:.2f} risk={risk_label}({risk:.2f})"
        f"{' context_hint=yes' if context_hinted else ''}"
    )
    return {
        "signal": signal,
        "validation": round(validation, 3),
        "centrality": central,
        "risk": round(risk, 3),
        "riskLabel": risk_label,
        "total": total,
        "summary": summary,
        "notes": {
            "validation": validation_note,
            "risk": risk_note,
            "contextHint": "Listed in Studio graph/focus hints." if context_hinted else None,
        },
    }


def attach_score_evidence(evidence: list[str], score: dict[str, Any]) -> list[str]:
    """Prepend explainable ranking line; keep at most six evidence lines."""
    summary = score.get("summary") or ""
    risk_note = (score.get("notes") or {}).get("risk")
    validation_note = (score.get("notes") or {}).get("validation")
    context_note = (score.get("notes") or {}).get("contextHint")
    prefix = [line for line in (summary, risk_note, validation_note, context_note) if line]
    merged: list[str] = []
    seen: set[str] = set()
    for line in [*prefix, *evidence]:
        text = str(line).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        merged.append(text)
        if len(merged) >= 6:
            break
    return merged


def explain_selected_reason(candidate: dict[str, Any]) -> str:
    score = candidate.get("score") or {}
    risk_label = score.get("riskLabel") or "unknown"
    total = score.get("total", 0)
    validation = score.get("validation", 0)
    parts = [
        f"Selected with total score {total:.3f} (threshold {SELECT_THRESHOLD:.2f}).",
        f"Risk={risk_label}, validation={validation:.2f}.",
    ]
    if any("context_hint=yes" in str(item) for item in candidate.get("evidence") or []):
        parts.append("Boosted by Studio context hints.")
    return " ".join(parts)


def explain_rejected_below_threshold(candidate: dict[str, Any]) -> str:
    score = candidate.get("score") or {}
    return (
        f"Below selection threshold ({score.get('total', 0):.3f} < {SELECT_THRESHOLD:.2f}). "
        f"Risk={score.get('riskLabel', 'unknown')}; improve signal, validation path, or centrality."
    )


