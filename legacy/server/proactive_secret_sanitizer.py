from __future__ import annotations

import os
import re
from contextlib import contextmanager
from typing import Any, Iterator, Optional

_GITHUB_TOKEN_RE = re.compile(r"\b(ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b")
_CREDENTIAL_URL_RE = re.compile(r"https://[^:\s]+:[^@\s]+@", re.I)
_BEARER_RE = re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.I)

SENSITIVE_FIELD_NAMES = frozenset(
    {
        "githubtoken",
        "github_token",
        "token",
        "authorization",
        "access_token",
        "refresh_token",
        "api_key",
        "apikey",
        "secret",
        "password",
        "credential",
    },
)

REDACTED = "***"
TEST_TOKEN_PLACEHOLDER = "ghp_PROACTIVE_TEST_DO_NOT_PERSIST_000000000000"


def redact_secrets(text: str, *, limit: int = 2000) -> str:
    cleaned = str(text or "")
    cleaned = _CREDENTIAL_URL_RE.sub("https://***@", cleaned)
    cleaned = _GITHUB_TOKEN_RE.sub(REDACTED, cleaned)
    cleaned = _BEARER_RE.sub(f"Bearer {REDACTED}", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > limit:
        return cleaned[: max(0, limit - 3)] + "..."
    return cleaned


def strip_sensitive_fields(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            if str(key).strip().lower() in SENSITIVE_FIELD_NAMES:
                continue
            cleaned[key] = strip_sensitive_fields(item)
        return cleaned
    if isinstance(value, list):
        return [strip_sensitive_fields(item) for item in value]
    if isinstance(value, str):
        return redact_secrets(value, limit=10_000)
    return value


def sanitize_exception_message(exc: BaseException, *, limit: int = 500) -> str:
    return redact_secrets(str(exc) or exc.__class__.__name__, limit=limit)


def normalize_github_token(token: Optional[str]) -> Optional[str]:
    value = str(token or "").strip()
    return value or None


@contextmanager
def transient_github_token(token: Optional[str]) -> Iterator[None]:
    """
    Apply a GitHub token only for the duration of sync/clone subprocesses.
    Does not persist the token to disk or proactive store records.
    """
    normalized = normalize_github_token(token)
    prior = os.environ.get("GITHUB_TOKEN")
    if normalized:
        os.environ["GITHUB_TOKEN"] = normalized
    try:
        yield
    finally:
        if normalized:
            if prior is None:
                os.environ.pop("GITHUB_TOKEN", None)
            else:
                os.environ["GITHUB_TOKEN"] = prior


def scan_text_for_secrets(text: str, *, needles: Optional[list[str]] = None) -> list[str]:
    findings: list[str] = []
    if _GITHUB_TOKEN_RE.search(text):
        findings.append("github_token_pattern")
    for needle in needles or []:
        if needle and needle in text:
            findings.append(f"needle:{needle[:12]}")
    return findings


def scan_store_tree_for_secrets(root: Any, *, needles: Optional[list[str]] = None) -> list[str]:
    from pathlib import Path

    base = Path(root)
    if not base.exists():
        return []
    violations: list[str] = []
    for path in base.rglob("*.json"):
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            continue
        hits = scan_text_for_secrets(raw, needles=needles)
        if hits:
            violations.append(f"{path}:{'|'.join(hits)}")
    return violations
