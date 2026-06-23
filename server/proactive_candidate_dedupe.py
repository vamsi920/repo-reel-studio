from __future__ import annotations

import re
from typing import Any, Optional

from proactive_candidate_score import DEDUPE_STRONG_THRESHOLD, MAX_SELECT_TARGET, SELECT_THRESHOLD, explain_selected_reason
from proactive_store import list_batches, list_candidates

RECENT_BATCH_LOOKBACK = 3
PATH_KEY_PREFIX = "path:"
PATH_KIND_KEY_PREFIX = "path_kind:"
TITLE_KEY_PREFIX = "title:"


def normalize_dedupe_path(path: str) -> str:
    return str(path or "").strip().replace("\\", "/").lstrip("/")


def normalize_dedupe_title(title: str) -> str:
    collapsed = re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()
    return collapsed[:96]


def primary_dedupe_key(path: str, kind: str) -> str:
    return f"{normalize_dedupe_path(path)}:{(kind or 'improvement').strip().lower()}"


def opportunity_keys(path: str, kind: str, title: str) -> set[str]:
    normalized_path = normalize_dedupe_path(path)
    normalized_kind = (kind or "improvement").strip().lower()
    normalized_title = normalize_dedupe_title(title)
    keys = {
        primary_dedupe_key(path, kind),
        f"{PATH_KEY_PREFIX}{normalized_path}",
        f"{PATH_KIND_KEY_PREFIX}{normalized_path}:{normalized_kind}",
    }
    if normalized_title:
        keys.add(f"{TITLE_KEY_PREFIX}{normalized_title}")
        keys.add(f"{TITLE_KEY_PREFIX}{normalized_path}:{normalized_title}")
    return keys


def candidate_strength(candidate: dict[str, Any]) -> tuple[float, float, float, str]:
    score = candidate.get("score") or {}
    return (
        float(score.get("total") or 0),
        float(score.get("centrality") or 0),
        float(score.get("signal") or 0),
        str(candidate.get("createdAt") or ""),
    )


def is_stronger_candidate(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return candidate_strength(left) > candidate_strength(right)


def explain_in_batch_duplicate(keeper: dict[str, Any], duplicate: dict[str, Any], *, match: str) -> str:
    keeper_score = (keeper.get("score") or {}).get("total", 0)
    duplicate_score = (duplicate.get("score") or {}).get("total", 0)
    return (
        f"Duplicate opportunity ({match}) already covered in this batch by "
        f"\"{keeper.get('title', 'another candidate')}\" "
        f"(score {keeper_score:.3f} vs {duplicate_score:.3f})."
    )


def explain_superseded_by_stronger(replacement: dict[str, Any], *, match: str) -> str:
    replacement_score = (replacement.get("score") or {}).get("total", 0)
    return (
        f"Superseded in this batch by stronger duplicate ({match}): "
        f"\"{replacement.get('title', 'another candidate')}\" (score {replacement_score:.3f})."
    )


def explain_cross_batch_duplicate(prior: dict[str, Any], duplicate: dict[str, Any], *, match: str) -> str:
    prior_score = (prior.get("score") or {}).get("total", 0)
    duplicate_score = (duplicate.get("score") or {}).get("total", 0)
    batch_id = str(prior.get("batchId") or "")[:8] or "recent"
    return (
        f"Duplicate opportunity ({match}) already surfaced in recent batch {batch_id} as "
        f"\"{prior.get('title', 'another candidate')}\" "
        f"(score {prior_score:.3f} vs {duplicate_score:.3f})."
    )


def explain_selection_path_duplicate(keeper: dict[str, Any], duplicate: dict[str, Any]) -> str:
    return explain_in_batch_duplicate(keeper, duplicate, match="same path")


class RecentOpportunityIndex:
    def __init__(self, entries: dict[str, dict[str, Any]]):
        self._entries = entries

    def blocking_match(self, candidate: dict[str, Any]) -> Optional[tuple[str, dict[str, Any]]]:
        for key in opportunity_keys(
            candidate_path(candidate),
            str(candidate.get("type") or "improvement"),
            str(candidate.get("title") or ""),
        ):
            prior = self._entries.get(key)
            if not prior:
                continue
            prior_candidate = prior["candidate"]
            if not is_stronger_candidate(candidate, prior_candidate):
                return key, prior_candidate
        return None


def load_recent_opportunity_index(
    repo_url: str,
    project_id: Optional[str],
    *,
    exclude_batch_id: Optional[str] = None,
    limit_batches: int = RECENT_BATCH_LOOKBACK,
) -> RecentOpportunityIndex:
    entries: dict[str, dict[str, Any]] = {}
    batches = list_batches(repo_url, project_id, limit=max(1, limit_batches))
    for batch in batches:
        batch_id = batch.get("id")
        if not batch_id or batch_id == exclude_batch_id:
            continue
        for candidate in list_candidates(repo_url, project_id, batch_id, include_dismissed=True):
            for key in opportunity_keys(
                candidate_path(candidate),
                str(candidate.get("type") or "improvement"),
                str(candidate.get("title") or ""),
            ):
                current = entries.get(key)
                if not current or is_stronger_candidate(candidate, current["candidate"]):
                    entries[key] = {"candidate": candidate, "batchId": batch_id}
    return RecentOpportunityIndex(entries)


def candidate_path(candidate: dict[str, Any]) -> str:
    key = str(candidate.get("dedupeKey") or "")
    if ":" in key:
        return key.split(":", 1)[0]
    return normalize_dedupe_path(key)


class BatchDedupeRegistry:
    """Track strongest opportunities within the active batch and against recent batches."""

    def __init__(self, recent_index: Optional[RecentOpportunityIndex] = None):
        self._recent = recent_index or RecentOpportunityIndex({})
        self._keepers: dict[str, dict[str, Any]] = {}
        self._ordered: list[dict[str, Any]] = []

    def consider(self, candidate: dict[str, Any]) -> None:
        path = candidate_path(candidate)
        kind = str(candidate.get("type") or "improvement")
        title = str(candidate.get("title") or "")

        recent_match = self._recent.blocking_match(candidate)
        if recent_match:
            _key, prior = recent_match
            self._reject(candidate, explain_cross_batch_duplicate(prior, candidate, match=_match_label(_key)))
            return

        keys = opportunity_keys(path, kind, title)
        colliding = {key: self._keepers[key] for key in keys if key in self._keepers}
        if not colliding:
            self._accept(candidate, keys, path, kind)
            return

        keeper = max(colliding.values(), key=lambda item: candidate_strength(item))
        if is_stronger_candidate(candidate, keeper):
            self._supersede(keeper, candidate, match=_match_label(next(iter(colliding))))
            self._accept(candidate, keys, path, kind)
            return

        match_key = next(key for key, value in colliding.items() if value is keeper)
        self._reject(candidate, explain_in_batch_duplicate(keeper, candidate, match=_match_label(match_key)))

    def finalize(self) -> list[dict[str, Any]]:
        return list(self._ordered)

    def _accept(self, candidate: dict[str, Any], keys: set[str], path: str, kind: str) -> None:
        candidate["dedupeKey"] = primary_dedupe_key(path, kind)
        for key in keys:
            self._keepers[key] = candidate
        self._ordered.append(candidate)

    def _reject(self, candidate: dict[str, Any], reason: str) -> None:
        candidate["status"] = "not_selected"
        candidate["notSelectedReason"] = reason
        self._ordered.append(candidate)

    def _supersede(self, prior: dict[str, Any], replacement: dict[str, Any], *, match: str) -> None:
        if prior.get("status") != "not_selected":
            prior["status"] = "not_selected"
            prior["notSelectedReason"] = explain_superseded_by_stronger(replacement, match=match)


def _match_label(key: str) -> str:
    if key.startswith(PATH_KIND_KEY_PREFIX):
        return "same path and type"
    if key.startswith(PATH_KEY_PREFIX):
        return "same path"
    if key.startswith(TITLE_KEY_PREFIX):
        return "same title"
    return "same opportunity"


def register_candidate(registry: BatchDedupeRegistry, candidate: dict[str, Any]) -> None:
    registry.consider(candidate)


def dedupe_candidates_for_selection(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return candidates eligible for threshold selection (skip pre-marked duplicates)."""
    return [candidate for candidate in candidates if candidate.get("status") != "not_selected"]


def select_candidates(candidates: list[dict[str, Any]], target: int) -> list[dict[str, Any]]:
    cap = max(1, min(int(target or MAX_SELECT_TARGET), MAX_SELECT_TARGET))
    eligible = sorted(
        dedupe_candidates_for_selection(candidates),
        key=lambda item: candidate_strength(item),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    path_keepers: dict[str, dict[str, Any]] = {}

    for candidate in eligible:
        if candidate["score"]["total"] < SELECT_THRESHOLD:
            candidate["notSelectedReason"] = (
                f"Below selection threshold ({candidate['score']['total']:.3f} < {SELECT_THRESHOLD:.2f}). "
                f"Risk={candidate.get('score', {}).get('riskLabel', 'unknown')}; improve signal, validation path, or centrality."
            )
            continue

        path = candidate_path(candidate)
        path_key = f"{PATH_KEY_PREFIX}{path}"
        if path_key in path_keepers:
            keeper = path_keepers[path_key]
            if candidate["score"]["total"] < DEDUPE_STRONG_THRESHOLD:
                candidate["notSelectedReason"] = explain_selection_path_duplicate(keeper, candidate)
                continue
            if len(selected) < cap:
                if keeper in selected:
                    selected.remove(keeper)
                keeper["status"] = "not_selected"
                keeper["notSelectedReason"] = explain_superseded_by_stronger(candidate, match="same path")

        if len(selected) >= cap:
            continue

        candidate["selectedReason"] = explain_selected_reason(candidate)
        selected.append(candidate)
        path_keepers[path_key] = candidate

    return selected
