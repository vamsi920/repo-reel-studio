from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any, Optional

from layman_compress_helper import compress_prompt_prose_safe
import token_savings

AI_LOG_STAGES = frozenset(
    {"selected", "preparing", "patching", "validating", "review_ready", "needs_execution"}
)

DEFAULT_AI_LOG_TIMEOUT_SECONDS = 8
MAX_TITLE_LEN = 80
MAX_DETAIL_LEN = 180

INVENTED_TOOL_PATTERNS = [
    re.compile(
        r"\b(ran|running|executed|executing|calling|invoked|spawned|launched|"
        r"browsed|clicked|installed|deployed)\s+(npm|yarn|pnpm|grep|curl|docker|"
        r"pytest|playwright|tool|sandbox|terminal)\b",
        re.I,
    ),
    re.compile(r"\b(using|via)\s+(mcp|tool use|function call|bash tool)\b", re.I),
    re.compile(r"\bI\s+(opened|edited|committed|pushed)\s+(a\s+)?(file|PR|pull request)\b", re.I),
]

SECRET_PATTERNS = [
    re.compile(r"(?i)\b(api[_-]?key|authorization|bearer)\b\s*[:=]\s*\S+"),
    re.compile(r"(?i)\bAIza[0-9A-Za-z\-_]{20,}\b"),
    re.compile(r"(?i)\bsk-[0-9A-Za-z]{12,}\b"),
    re.compile(r"(?i)key=[A-Za-z0-9\-_%]{12,}"),
]


def ai_log_timeout_seconds() -> int:
    raw = os.getenv("PROACTIVE_AI_LOG_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return DEFAULT_AI_LOG_TIMEOUT_SECONDS
    try:
        return max(1, min(int(raw), 30))
    except (TypeError, ValueError):
        return DEFAULT_AI_LOG_TIMEOUT_SECONDS


def sanitize_console_text(value: str, *, max_len: int = MAX_DETAIL_LEN) -> str:
    text = str(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", " ", text)
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[redacted]", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        text = text[: max_len - 3].rstrip() + "..."
    return text


def contains_invented_tool_action(text: str) -> bool:
    return any(pattern.search(text or "") for pattern in INVENTED_TOOL_PATTERNS)


def _compress_field(text: str) -> str:
    """Strip filler words from a single free-text field before it's embedded
    in a `key=value` prompt line. compress_prompt_prose_safe preserves whole
    `key=value` lines verbatim (by design, for diffs/commands/paths), so
    compression has to happen on the bare value, not the assembled line."""
    if not text:
        return text
    return compress_prompt_prose_safe(text)


def build_fallback_console_log(
    candidate: dict[str, Any],
    stage: str,
    source_title: str,
    source_detail: str = "",
) -> dict[str, Any]:
    title = sanitize_console_text(source_title or f"Status: {stage}", max_len=MAX_TITLE_LEN)
    detail_source = source_detail or str(candidate.get("hypothesis") or "").strip()
    if not detail_source:
        detail_source = f"Candidate remains in {stage.replace('_', ' ')}."
    detail = sanitize_console_text(detail_source, max_len=MAX_DETAIL_LEN)
    return {
        "title": title or "Operator update",
        "detail": detail,
        "model": "deterministic-fallback",
        "fallback": True,
    }


def scrub_model_log(
    parsed: dict[str, Any],
    *,
    source_title: str,
    source_detail: str,
    candidate: dict[str, Any],
    stage: str,
) -> dict[str, Any]:
    title = sanitize_console_text(str(parsed.get("title") or ""), max_len=MAX_TITLE_LEN)
    detail = sanitize_console_text(str(parsed.get("detail") or ""), max_len=MAX_DETAIL_LEN)
    if not title:
        title = sanitize_console_text(source_title or f"Status: {stage}", max_len=MAX_TITLE_LEN)
    if not detail:
        return build_fallback_console_log(candidate, stage, source_title, source_detail)
    combined = f"{title} {detail}"
    if contains_invented_tool_action(combined):
        return build_fallback_console_log(candidate, stage, source_title, source_detail)
    return {"title": title, "detail": detail, "model": parsed.get("model"), "fallback": False}


def generate_ai_console_log(
    candidate: dict[str, Any],
    stage: str,
    source_title: str,
    source_detail: str = "",
    *,
    now_fn=None,
) -> dict[str, Any]:
    """Return a console log dict; uses deterministic fallback when Gemini is unavailable."""
    fallback = build_fallback_console_log(candidate, stage, source_title, source_detail)
    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY") or "").strip()
    if not api_key:
        return fallback

    model = (
        os.getenv("PROACTIVE_LOG_MODEL")
        or os.getenv("GEMINI_FLASH_LITE_MODEL")
        or "gemini-2.5-flash-lite"
    ).replace("google:", "").strip()

    # Compress the free-text field VALUES before they're embedded in
    # `key=value` lines — compress_prompt_prose_safe preserves whole
    # key=value lines verbatim (by design), so compressing after assembly
    # would be a no-op.
    raw_hypothesis = str(candidate.get("hypothesis") or "")
    event_text = _compress_field(source_title)
    detail_text = _compress_field(source_detail)
    hypothesis_text = _compress_field(raw_hypothesis)

    original_field_len = len(source_title or "") + len(source_detail or "") + len(raw_hypothesis)
    compressed_field_len = len(event_text) + len(detail_text) + len(hypothesis_text)
    token_savings.record_savings(
        "proactive", "console_log", original_field_len, compressed_field_len,
        run_id=str(candidate.get("runId") or "") or None,
    )

    prompt = f"""
You write one live console log line for a proactive coding operator.
Return strict JSON only:
{{"title":"<=7 words","detail":"<=120 chars, first-person present tense"}}

Rules:
- Summarize ONLY the provided state below.
- Do NOT mention tools, terminals, npm, docker, browsers, MCP, or actions you did not observe in the state text.
- Do NOT invent commands, file edits, installs, or PR actions.
- No promises or hype.

State:
stage={sanitize_console_text(stage, max_len=40)}
event={sanitize_console_text(event_text, max_len=120)}
detail={sanitize_console_text(detail_text, max_len=160)}
candidate_title={sanitize_console_text(str(candidate.get("title") or ""), max_len=80)}
hypothesis={sanitize_console_text(hypothesis_text, max_len=120)}
status={sanitize_console_text(str(candidate.get("status") or ""), max_len=40)}
run_id={sanitize_console_text(str(candidate.get("runId") or ""), max_len=24)}
""".strip()

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "topK": 12,
            "topP": 0.75,
            "maxOutputTokens": 140,
            "responseMimeType": "application/json",
        },
    }
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    timeout = ai_log_timeout_seconds()
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if time.monotonic() - started > timeout:
                return fallback
            raw = json.loads(response.read().decode("utf-8"))
            text = raw.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
            match = re.search(r"\{[\s\S]*\}", cleaned)
            parsed = json.loads(match.group(0) if match else cleaned)
            if not isinstance(parsed, dict):
                return fallback
            parsed["model"] = model
            return scrub_model_log(
                parsed,
                source_title=source_title,
                source_detail=source_detail,
                candidate=candidate,
                stage=stage,
            )
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError, KeyError, IndexError):
        return fallback
    except Exception:
        return fallback


def next_timeline_seq(candidate: dict[str, Any]) -> int:
    timeline = candidate.get("timeline")
    if not isinstance(timeline, list):
        return 1
    highest = 0
    for event in timeline:
        if not isinstance(event, dict):
            continue
        try:
            highest = max(highest, int(event.get("seq", 0)))
        except (TypeError, ValueError):
            continue
    return highest + 1


def sort_candidate_timeline(candidate: dict[str, Any]) -> None:
    timeline = candidate.get("timeline")
    if not isinstance(timeline, list):
        return
    timeline.sort(
        key=lambda event: (
            int(event.get("seq", 0)) if isinstance(event, dict) else 0,
            str(event.get("at") or "") if isinstance(event, dict) else "",
        )
    )


def append_timeline_event(candidate: dict[str, Any], event: dict[str, Any], *, now_iso) -> None:
    event = dict(event)
    event.setdefault("seq", next_timeline_seq(candidate))
    event.setdefault("at", now_iso())
    candidate.setdefault("timeline", []).append(event)
    sort_candidate_timeline(candidate)


def append_candidate_event(
    candidate: dict[str, Any],
    stage: str,
    title: str,
    detail: str = "",
    level: str = "info",
    *,
    now_iso,
) -> dict[str, Any]:
    candidate["stage"] = stage
    append_timeline_event(
        candidate,
        {
            "stage": stage,
            "title": sanitize_console_text(title, max_len=MAX_TITLE_LEN),
            "detail": sanitize_console_text(detail, max_len=MAX_DETAIL_LEN),
            "level": level,
            "source": "system",
        },
        now_iso=now_iso,
    )
    return candidate


def append_ai_console_log(
    candidate: dict[str, Any],
    stage: str,
    source_title: str,
    source_detail: str = "",
    level: str = "info",
    *,
    now_iso,
) -> None:
    log = generate_ai_console_log(candidate, stage, source_title, source_detail)
    append_timeline_event(
        candidate,
        {
            "stage": f"ai_{stage}",
            "title": sanitize_console_text(log.get("title") or "Operator note", max_len=MAX_TITLE_LEN),
            "detail": sanitize_console_text(log.get("detail") or "", max_len=MAX_DETAIL_LEN),
            "level": level,
            "source": "ai",
            "model": log.get("model"),
            "aiLog": {
                "stage": stage,
                "sourceTitle": sanitize_console_text(source_title, max_len=MAX_TITLE_LEN),
                "sourceDetail": sanitize_console_text(source_detail, max_len=MAX_DETAIL_LEN),
                "fallback": bool(log.get("fallback")),
            },
        },
        now_iso=now_iso,
    )


def persist_candidate_event(
    candidate: dict[str, Any],
    stage: str,
    title: str,
    detail: str = "",
    level: str = "info",
    ai_narrate: bool = False,
    *,
    now_iso,
    update_candidate_fn,
) -> dict[str, Any]:
    append_candidate_event(candidate, stage, title, detail, level, now_iso=now_iso)
    if ai_narrate and stage in AI_LOG_STAGES:
        append_ai_console_log(candidate, stage, title, detail, level, now_iso=now_iso)
    return update_candidate_fn(candidate)
