#!/usr/bin/env python3
"""
List proactive scopes and run daily dispatch for cron / external schedulers.

Internal mode (default): calls dispatch_daily in-process — no HTTP Bearer required.
HTTP mode (--http): POST /api/proactive/dispatch-daily — requires PROACTIVE_CRON_TOKEN when set on server.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional
from urllib import error, request

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _api_dispatch_url() -> str:
    base = (
        os.getenv("PROACTIVE_DISPATCH_API_BASE", "").strip()
        or os.getenv("AGENT_RUNS_PROXY_URL", "http://127.0.0.1:8788").strip()
    ).rstrip("/")
    if base.endswith("/api"):
        return f"{base}/proactive/dispatch-daily"
    return f"{base}/api/proactive/dispatch-daily"


def _http_dispatch(repo_url: str, project_id: Optional[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {"repoUrl": repo_url}
    if project_id:
        payload["projectId"] = project_id
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    token = os.getenv("PROACTIVE_CRON_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = request.Request(_api_dispatch_url(), data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=3600) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"dispatch-daily HTTP {exc.code}: {detail[:500]}") from exc
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise SystemExit("dispatch-daily returned non-object JSON")
    return parsed


def _internal_dispatch(repo_url: str, project_id: Optional[str]) -> dict[str, Any]:
    from proactive_orchestrator import dispatch_daily

    return dispatch_daily(repo_url, project_id=project_id)


def cmd_list(enabled_only: bool) -> int:
    from proactive_store import list_proactive_dispatch_scopes

    scopes = list_proactive_dispatch_scopes(enabled_only=enabled_only)
    print(json.dumps(scopes, indent=2))
    return 0


def cmd_dispatch(
    repo_url: Optional[str],
    project_id: Optional[str],
    *,
    enabled_only: bool,
    use_http: bool,
    dry_run: bool,
) -> int:
    from proactive_store import list_proactive_dispatch_scopes

    if repo_url:
        targets = [{"repoUrl": repo_url, "projectId": project_id}]
    else:
        targets = list_proactive_dispatch_scopes(enabled_only=enabled_only)

    if not targets:
        print("No proactive scopes matched.", file=sys.stderr)
        return 0

    dispatch_fn = _http_dispatch if use_http else _internal_dispatch
    exit_code = 0
    for item in targets:
        scope_repo = str(item.get("repoUrl") or "")
        scope_project = item.get("projectId")
        label = f"{scope_repo}::{scope_project or ''}"
        if dry_run:
            print(f"dry-run would dispatch {label}")
            continue
        result = dispatch_fn(scope_repo, scope_project if scope_project else None)
        status = str(result.get("status") or "unknown")
        print(f"{label} -> {status}")
        if status == "skipped":
            print(f"  reason: {result.get('reason')}")
        elif result.get("reason"):
            print(f"  note: {result.get('reason')}")
        if status == "failed":
            exit_code = 1
    return exit_code


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Proactive daily dispatch cron helper")
    sub = parser.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list", help="List proactive scopes (JSON)")
    list_parser.add_argument(
        "--enabled-only",
        action="store_true",
        help="Only scopes with config.enabled=true",
    )

    run_parser = sub.add_parser("run", help="Run dispatch-daily for one or all enabled scopes")
    run_parser.add_argument("--repo-url", help="GitHub repo URL (omit to run all enabled scopes)")
    run_parser.add_argument("--project-id", default=None, help="Studio project id")
    run_parser.add_argument(
        "--all-enabled",
        action="store_true",
        help="Dispatch every enabled scope (default when --repo-url omitted)",
    )
    run_parser.add_argument(
        "--http",
        action="store_true",
        help="Use HTTP POST instead of in-process dispatch_daily",
    )
    run_parser.add_argument("--dry-run", action="store_true", help="Print targets without dispatching")

    args = parser.parse_args(argv)
    if args.command == "list":
        return cmd_list(bool(args.enabled_only))
    if args.command == "run":
        enabled_only = bool(args.all_enabled or not args.repo_url)
        return cmd_dispatch(
            args.repo_url,
            args.project_id,
            enabled_only=enabled_only,
            use_http=bool(args.http),
            dry_run=bool(args.dry_run),
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
