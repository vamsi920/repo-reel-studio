"""Minimal Supabase REST (PostgREST) client for server-side Python services.

Uses only the standard library (urllib) — no new pip dependency — consistent
with how this codebase already talks to the GitHub API (see agent_runs.py).
Always uses the service-role key, so it bypasses RLS; never expose this
module's calls to untrusted input beyond what the caller already validates.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional


def _base_url() -> Optional[str]:
    url = os.environ.get("SUPABASE_URL", "").strip()
    return url.rstrip("/") if url else None


def _service_key() -> Optional[str]:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return key or None


def is_configured() -> bool:
    return bool(_base_url() and _service_key())


def _headers(extra: Optional[dict[str, str]] = None) -> dict[str, str]:
    key = _service_key() or ""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _request(
    method: str,
    path: str,
    body: Any = None,
    headers_extra: Optional[dict[str, str]] = None,
    timeout: int = 15,
) -> Any:
    base = _base_url()
    if not base:
        raise RuntimeError("Supabase is not configured (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing)")
    url = f"{base}/rest/v1{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers=_headers(headers_extra))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Supabase REST error {exc.code}: {detail}") from exc


def _filter_query(filters: dict[str, Any]) -> str:
    return "&".join(f"{k}=eq.{urllib.parse.quote(str(v), safe='')}" for k, v in filters.items())


def select(
    table: str,
    filters: dict[str, Any],
    order: Optional[str] = None,
    limit: Optional[int] = None,
) -> list[dict[str, Any]]:
    parts = [_filter_query(filters)] if filters else []
    if order:
        parts.append(f"order={order}")
    if limit:
        parts.append(f"limit={limit}")
    query = "&".join(p for p in parts if p)
    result = _request("GET", f"/{table}?{query}" if query else f"/{table}")
    return result or []


def select_one(table: str, filters: dict[str, Any]) -> Optional[dict[str, Any]]:
    rows = select(table, filters, limit=1)
    return rows[0] if rows else None


def upsert(table: str, row: dict[str, Any], on_conflict: str) -> Optional[dict[str, Any]]:
    result = _request(
        "POST",
        f"/{table}?on_conflict={on_conflict}",
        body=row,
        headers_extra={"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    return (result or [None])[0]


def insert(table: str, row: dict[str, Any]) -> Optional[dict[str, Any]]:
    result = _request("POST", f"/{table}", body=row, headers_extra={"Prefer": "return=representation"})
    return (result or [None])[0]


def update(table: str, filters: dict[str, Any], patch: dict[str, Any]) -> None:
    query = _filter_query(filters)
    _request("PATCH", f"/{table}?{query}", body=patch)


def delete(table: str, filters: dict[str, Any]) -> None:
    query = _filter_query(filters)
    _request("DELETE", f"/{table}?{query}")
