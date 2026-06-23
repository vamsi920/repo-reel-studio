"""Minimal caveman-lite helper for Agent Ops token optimization.

Applies lightweight prose compression rules (inspired by github.com/juliusbrussee/caveman)
to reduce token usage in LLM prompts without altering structured data, code, diffs, or commands.
Only vendors the minimal compression logic — not the full caveman repo.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------

_TRUTHY = {"1", "true", "yes"}


def is_enabled() -> bool:
    return os.environ.get("CAVEMAN_HELPER_ENABLED", "0").lower().strip() in _TRUTHY


def get_config() -> dict:
    return {
        "enabled": is_enabled(),
        "mode": os.environ.get("CAVEMAN_HELPER_MODE", "lite").lower().strip(),
    }


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


@dataclass
class CavemanMetrics:
    original_chars: int = 0
    compressed_chars: int = 0
    compression_ratio: float = 0.0
    sections_compressed: int = 0
    sections_skipped: int = 0
    helper_enabled: bool = False
    helper_mode: str = "lite"

    def to_dict(self) -> dict:
        return {
            "original_chars": self.original_chars,
            "compressed_chars": self.compressed_chars,
            "compression_ratio": self.compression_ratio,
            "sections_compressed": self.sections_compressed,
            "sections_skipped": self.sections_skipped,
            "helper_enabled": self.helper_enabled,
            "helper_mode": self.helper_mode,
        }


# ---------------------------------------------------------------------------
# Compression tables
# ---------------------------------------------------------------------------

_FILLER_PHRASES: list[str] = [
    "I'd be happy to",
    "Sure!",
    "Let me",
    "I think that",
    "It's worth noting that",
    "As you can see",
    "Basically",
    "In order to",
    "It should be noted that",
    "Please note that",
    "It is important to",
    "As mentioned earlier",
    "Going forward",
    "At this point in time",
    "Due to the fact that",
    "In the event that",
    "For the purpose of",
    "With regard to",
    "In terms of",
    "As a matter of fact",
    "It goes without saying",
]

_SHORTENING_MAP: list[tuple[str, str]] = [
    ("in order to", "to"),
    ("due to the fact that", "because"),
    ("at this point in time", "now"),
    ("in the event that", "if"),
    ("for the purpose of", "to"),
    ("with regard to", "regarding"),
    ("a large number of", "many"),
    ("in close proximity to", "near"),
    ("has the ability to", "can"),
    ("is able to", "can"),
    ("make a decision", "decide"),
    ("take into consideration", "consider"),
    ("give an indication of", "indicate"),
    ("on a daily basis", "daily"),
    ("at the present time", "now"),
    ("prior to", "before"),
    ("subsequent to", "after"),
    ("in the near future", "soon"),
    ("a significant amount of", "much"),
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _case_aware_replace(match: re.Match, replacement: str) -> str:
    """Preserve the case of the first character of the matched text."""
    original = match.group(0)
    if not original or not replacement:
        return replacement
    if original[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def _build_filler_pattern() -> re.Pattern:
    escaped = [re.escape(p) for p in sorted(_FILLER_PHRASES, key=len, reverse=True)]
    return re.compile(r"(?:" + "|".join(escaped) + r")\s*", re.IGNORECASE)


def _build_shortening_patterns() -> list[tuple[re.Pattern, str]]:
    patterns = []
    for phrase, short in sorted(_SHORTENING_MAP, key=lambda x: len(x[0]), reverse=True):
        pat = re.compile(re.escape(phrase), re.IGNORECASE)
        patterns.append((pat, short))
    return patterns


_FILLER_RE = _build_filler_pattern()
_SHORTENING_PATTERNS = _build_shortening_patterns()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _apply_compression(text: str) -> str:
    """Core compression logic without the enabled check or outer strip."""
    result = text

    # Shorten verbose phrases first (case-insensitive, preserve leading case)
    for pat, short in _SHORTENING_PATTERNS:
        result = pat.sub(lambda m: _case_aware_replace(m, short), result)

    # Strip filler phrases
    result = _FILLER_RE.sub("", result)

    # Collapse whitespace
    result = re.sub(r"\n{3,}", "\n\n", result)
    result = re.sub(r"[ \t]{2,}", " ", result)

    return result


def compress_prose(text: str) -> str:
    """Apply caveman-lite compression rules to prose text.

    Returns text unchanged when the helper is disabled.
    """
    if not is_enabled():
        return text
    if not text:
        return text
    return _apply_compression(text).strip()


def compress_issue_body(body: str, max_chars: int = 5000) -> str:
    """Compress an issue body while preserving code blocks verbatim."""
    if not body:
        return body
    if not is_enabled():
        return body[:max_chars] if len(body) > max_chars else body

    parts = re.split(r"(```[\s\S]*?```)", body)
    compressed_parts: list[str] = []
    for part in parts:
        if part.startswith("```"):
            compressed_parts.append(part)
        else:
            compressed_parts.append(_apply_compression(part))

    result = "".join(compressed_parts).strip()

    if len(result) > max_chars:
        result = result[:max_chars].rstrip() + "\n…"

    return result


def compress_comments(comments: list[dict]) -> list[dict]:
    """Compress the 'body' field of each comment dict, preserving other fields."""
    compressed: list[dict] = []
    for comment in comments:
        out = dict(comment)
        if "body" in out and isinstance(out["body"], str):
            out["body"] = compress_prose(out["body"])
        compressed.append(out)
    return compressed


def _looks_like_prose(section: str) -> bool:
    """Heuristic: returns True if a section looks like natural language prose."""
    stripped = section.strip()
    if not stripped:
        return False
    # File paths
    if stripped.startswith("/") or stripped.startswith("./"):
        return False
    # Commands (common prefixes)
    if stripped.startswith("$") or stripped.startswith("!"):
        return False
    # Numbered lists that are just references
    if re.match(r"^\d+[\.\)]\s", stripped):
        return False
    # JSON
    if stripped.startswith("{") or stripped.startswith("["):
        return False
    return True


def compress_prompt_sections(sections: list[str]) -> list[str]:
    """Compress prose sections, leave structured data unchanged."""
    result: list[str] = []
    for section in sections:
        if _looks_like_prose(section):
            result.append(compress_prose(section))
        else:
            result.append(section)
    return result


def compress_pr_body(body: str) -> str:
    """Split by markdown headers, compress prose sections, leave code/file listings alone."""
    if not body:
        return body
    if not is_enabled():
        return body

    parts = re.split(r"(^## .+$)", body, flags=re.MULTILINE)
    compressed_parts: list[str] = []

    for part in parts:
        if part.startswith("## "):
            compressed_parts.append(part)
        else:
            sub_parts = re.split(r"(```[\s\S]*?```)", part)
            for sp in sub_parts:
                if sp.startswith("```"):
                    compressed_parts.append(sp)
                elif _looks_like_prose(sp):
                    compressed_parts.append(_apply_compression(sp))
                else:
                    compressed_parts.append(sp)

    return "".join(compressed_parts).strip()


def measure_prompt(label: str, text: str) -> CavemanMetrics:
    """Measure compression metrics and print a one-line log."""
    config = get_config()
    original_chars = len(text)

    if config["enabled"]:
        compressed = compress_prose(text)
        compressed_chars = len(compressed)
    else:
        compressed_chars = original_chars

    ratio = (
        round((1 - compressed_chars / original_chars) * 100, 1)
        if original_chars > 0
        else 0.0
    )

    metrics = CavemanMetrics(
        original_chars=original_chars,
        compressed_chars=compressed_chars,
        compression_ratio=ratio,
        sections_compressed=1 if config["enabled"] else 0,
        sections_skipped=0 if config["enabled"] else 1,
        helper_enabled=config["enabled"],
        helper_mode=config["mode"],
    )

    print(f"[caveman] {label}: {original_chars} -> {compressed_chars} chars ({ratio}% saved)")

    return metrics
