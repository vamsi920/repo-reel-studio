from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

MAX_FOCUS_FILES = 10
MAX_HUB_FILES = 8
MAX_ENTRY_FILES = 6
MAX_TECHNOLOGIES = 8
MAX_ARCHITECTURE_LEN = 240
MAX_EVIDENCE_COUNT = 10_000

REPO_ROOT_MARKERS = ("/src/", "/server/", "/lib/", "/app/", "/components/", "/pages/", "/routes/")

CONTEXT_HINT_FOCUS_BONUS = 0.08
CONTEXT_HINT_HUB_BONUS = 0.04
CONTEXT_HINT_ENTRY_BONUS = 0.04
CONTEXT_HINT_BONUS_CAP = 0.12


def normalize_repo_relative_path(path: Any) -> Optional[str]:
    cleaned = str(path or "").strip().replace("\\", "/")
    if not cleaned:
        return None
    if ".." in cleaned.split("/"):
        return None
    if cleaned.startswith("local://"):
        cleaned = cleaned[len("local://") :].lstrip("/")
    lowered = cleaned.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return None

    if not cleaned.startswith("/"):
        return cleaned.lstrip("/")

    best: Optional[str] = None
    for marker in REPO_ROOT_MARKERS:
        idx = lowered.rfind(marker)
        if idx < 0:
            continue
        candidate = cleaned[idx + 1 :].lstrip("/")
        if best is None or len(candidate) > len(best):
            best = candidate
    if best:
        return best

    return cleaned.lstrip("/")


def _normalize_path_list(values: Any, limit: int, workspace: Optional[Path]) -> list[str]:
    if not isinstance(values, list):
        return []
    seen: set[str] = set()
    ordered: list[str] = []
    for raw in values:
        rel = normalize_repo_relative_path(raw)
        if not rel or rel in seen:
            continue
        if workspace is not None:
            try:
                absolute = (workspace / rel).resolve()
                workspace_root = workspace.resolve()
                if not str(absolute).startswith(str(workspace_root)):
                    continue
            except OSError:
                pass
        seen.add(rel)
        ordered.append(rel)
        if len(ordered) >= limit:
            break
    return ordered


def _normalize_string_list(values: Any, limit: int) -> list[str]:
    if not isinstance(values, list):
        return []
    seen: set[str] = set()
    ordered: list[str] = []
    for raw in values:
        text = str(raw or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        ordered.append(text[:120])
        if len(ordered) >= limit:
            break
    return ordered


def _normalize_count(value: Any) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(count, MAX_EVIDENCE_COUNT))


def _normalize_architecture(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    return text[:MAX_ARCHITECTURE_LEN]


def normalize_proactive_context_hints(
    raw: Any,
    *,
    workspace: Optional[Path] = None,
) -> dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    evidence = _normalize_count(data.get("evidenceCount") or data.get("snippetCount"))
    snippet = _normalize_count(data.get("snippetCount") or data.get("evidenceCount") or evidence)
    return {
        "focusFiles": _normalize_path_list(data.get("focusFiles"), MAX_FOCUS_FILES, workspace),
        "hubFiles": _normalize_path_list(data.get("hubFiles"), MAX_HUB_FILES, workspace),
        "entryFiles": _normalize_path_list(data.get("entryFiles"), MAX_ENTRY_FILES, workspace),
        "technologies": _normalize_string_list(data.get("technologies"), MAX_TECHNOLOGIES),
        "architecture": _normalize_architecture(data.get("architecture")),
        "evidenceCount": evidence,
        "snippetCount": snippet,
    }


def context_hint_sets(hints: dict[str, Any]) -> tuple[set[str], set[str], set[str], set[str]]:
    focus = set(hints.get("focusFiles") or [])
    hub = set(hints.get("hubFiles") or [])
    entry = set(hints.get("entryFiles") or [])
    return focus, hub, entry, focus | hub | entry


def path_matches_hint(repo_relative: str, hint_paths: set[str]) -> bool:
    norm = normalize_repo_relative_path(repo_relative) or str(repo_relative or "").strip().lstrip("/")
    if not norm:
        return False
    if norm in hint_paths:
        return True
    for hint in hint_paths:
        if norm == hint or norm.endswith(f"/{hint}") or hint.endswith(f"/{norm}"):
            return True
    return False


def context_hint_flags_for_path(path: str, hints: dict[str, Any]) -> dict[str, bool]:
    focus, hub, entry, _ = context_hint_sets(hints)
    return {
        "focus": path_matches_hint(path, focus),
        "hub": path_matches_hint(path, hub),
        "entry": path_matches_hint(path, entry),
    }


def compute_context_hint_bonus(
    *,
    in_focus: bool = False,
    in_hub: bool = False,
    in_entry: bool = False,
) -> float:
    bonus = 0.0
    if in_focus:
        bonus += CONTEXT_HINT_FOCUS_BONUS
    if in_hub:
        bonus += CONTEXT_HINT_HUB_BONUS
    if in_entry:
        bonus += CONTEXT_HINT_ENTRY_BONUS
    return min(CONTEXT_HINT_BONUS_CAP, bonus)


def manifest_evidence_floor(local_count: int, hints: dict[str, Any], in_focus: bool) -> int:
    if not in_focus:
        return local_count
    manifest_count = _normalize_count(hints.get("evidenceCount") or hints.get("snippetCount"))
    if manifest_count <= 0:
        return local_count
    boosted = max(local_count, min(8, manifest_count // 4))
    return boosted


def merge_run_context_hints(candidate_path: str, dispatch_hints: Optional[dict[str, Any]]) -> dict[str, Any]:
    normalized = normalize_proactive_context_hints(dispatch_hints or {})
    focus_files = list(
        dict.fromkeys(
            [
                normalize_repo_relative_path(candidate_path) or candidate_path,
                *(normalized.get("focusFiles") or []),
            ],
        ),
    )[:MAX_FOCUS_FILES]
    return {
        "focusFiles": focus_files,
        "hubFiles": list(normalized.get("hubFiles") or []),
        "entryFiles": list(normalized.get("entryFiles") or []),
        "technologies": list(normalized.get("technologies") or []),
        "architecture": normalized.get("architecture"),
        "evidenceCount": int(normalized.get("evidenceCount") or 0),
        "snippetCount": int(normalized.get("snippetCount") or normalized.get("evidenceCount") or 0),
    }
