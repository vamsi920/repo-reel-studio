"""Durable token-savings tracking.

Every place in Agent Ops / Proactive that measures or applies prompt
compression (caveman_helper / layman_compress_helper) reports the result
here. Persists to Supabase's `token_savings_events` table via
`supabase_store` (best-effort, never raises — recording a metric must never
break the pipeline it's measuring).
"""
from __future__ import annotations

from typing import Any, Optional

import supabase_store

Source = str  # "agent_ops" | "proactive"


def record_savings(
    source: Source,
    label: str,
    original_chars: int,
    compressed_chars: int,
    run_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> None:
    if original_chars <= 0 or compressed_chars >= original_chars:
        return
    if not supabase_store.is_configured():
        return

    saved_chars = original_chars - compressed_chars
    saved_tokens = saved_chars // 4
    if saved_tokens <= 0:
        return

    ratio = round((saved_chars / original_chars) * 100, 2)

    try:
        supabase_store.insert(
            "token_savings_events",
            {
                "source": source,
                "label": label,
                "run_id": run_id,
                "project_id": project_id,
                "original_chars": original_chars,
                "compressed_chars": compressed_chars,
                "saved_chars": saved_chars,
                "saved_tokens": saved_tokens,
                "compression_ratio": ratio,
            },
        )
    except Exception:  # noqa: BLE001
        pass


def record_from_metrics(
    source: Source,
    label: str,
    metrics: Any,
    run_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> None:
    """Convenience wrapper for a `CavemanMetrics`-shaped object
    (has `.original_chars` / `.compressed_chars`)."""
    record_savings(
        source,
        label,
        original_chars=getattr(metrics, "original_chars", 0),
        compressed_chars=getattr(metrics, "compressed_chars", 0),
        run_id=run_id,
        project_id=project_id,
    )
