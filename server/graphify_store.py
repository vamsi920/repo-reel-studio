"""Persist and resolve per-project graphify-out workspaces for path/explain queries.

Layout mirrors Phase-1 repo cache:
  server/.repo-workspaces/<projectId>/graphify-out/graph.json
  server/.repo-workspaces/<projectId>/graphify-meta.json
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Optional

from repo_workspace import REPO_WORKSPACES_ROOT

GRAPHIFY_OUT_DIRNAME = "graphify-out"
GRAPHIFY_META_FILENAME = "graphify-meta.json"


def sanitize_project_id(project_id: str) -> str:
    """Allow UUID or opaque studio ids; reject path traversal."""
    pid = (project_id or "").strip()
    if not pid or ".." in pid or "/" in pid or "\\" in pid:
        raise ValueError("projectId must be a non-empty path-safe identifier")
    return pid


def project_graphify_root(project_id: str) -> Path:
    return REPO_WORKSPACES_ROOT / sanitize_project_id(project_id)


def graphify_out_path(project_id: str) -> Path:
    return project_graphify_root(project_id) / GRAPHIFY_OUT_DIRNAME


def graphify_meta_path(project_id: str) -> Path:
    return project_graphify_root(project_id) / GRAPHIFY_META_FILENAME


def graphify_query_cwd(project_id: str) -> Path:
    """Directory that must contain graphify-out/ for CLI path/explain commands."""
    return project_graphify_root(project_id)


def workspace_ready(project_id: str) -> dict[str, Any]:
    """Return readiness info for a project's persisted graphify workspace."""
    try:
        pid = sanitize_project_id(project_id)
    except ValueError as exc:
        return {
            "ready": False,
            "projectId": project_id,
            "reason": str(exc),
            "path": None,
            "meta": None,
        }

    out_dir = graphify_out_path(pid)
    graph_json = out_dir / "graph.json"
    meta = read_graphify_meta(pid)

    if not graph_json.is_file():
        return {
            "ready": False,
            "projectId": pid,
            "reason": "graphify workspace not built — re-ingest the project (USE_GRAPHIFY is on by default)",
            "path": str(out_dir),
            "meta": meta,
        }

    return {
        "ready": True,
        "projectId": pid,
        "reason": None,
        "path": str(out_dir),
        "meta": meta,
        "extractedAt": (meta or {}).get("extractedAt"),
        "nodeCount": (meta or {}).get("nodeCount"),
        "edgeCount": (meta or {}).get("edgeCount"),
    }


def read_graphify_meta(project_id: str) -> Optional[dict[str, Any]]:
    path = graphify_meta_path(project_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def write_graphify_meta(project_id: str, data: dict[str, Any]) -> None:
    root = project_graphify_root(project_id)
    root.mkdir(parents=True, exist_ok=True)
    graphify_meta_path(project_id).write_text(json.dumps(data, indent=2), encoding="utf-8")


def persist_graphify_workspace(
    project_id: str,
    source_workspace: str | Path,
    *,
    adapted_summary: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Copy source_workspace/graphify-out → .repo-workspaces/<projectId>/graphify-out.

    source_workspace is the directory that contains graphify-out/ (typically the
    staged ingest temp dir). Returns readiness payload.
    """
    pid = sanitize_project_id(project_id)
    src = Path(source_workspace).resolve()
    src_out = src / GRAPHIFY_OUT_DIRNAME
    if not src_out.is_dir() or not (src_out / "graph.json").is_file():
        raise FileNotFoundError(
            f"No graphify-out/graph.json under {src} — extract must succeed before persist"
        )

    dest_root = project_graphify_root(pid)
    dest_root.mkdir(parents=True, exist_ok=True)
    dest_out = graphify_out_path(pid)
    if dest_out.exists():
        shutil.rmtree(dest_out)
    shutil.copytree(src_out, dest_out)

    node_count = edge_count = None
    try:
        raw = json.loads((dest_out / "graph.json").read_text(encoding="utf-8"))
        nodes = raw.get("nodes") or []
        links = raw.get("links") or raw.get("edges") or []
        node_count = len(nodes)
        edge_count = len(links)
    except (json.JSONDecodeError, OSError):
        pass

    if adapted_summary:
        node_count = adapted_summary.get("totalSymbols") or adapted_summary.get("totalFiles") or node_count
        edge_count = adapted_summary.get("totalEdges") or edge_count

    meta = {
        "extractedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "nodeCount": node_count,
        "edgeCount": edge_count,
        "graphifyVersion": None,
        "sourceWorkspace": str(src),
    }
    write_graphify_meta(pid, meta)
    return workspace_ready(pid)


def main() -> int:
    """CLI: persist <projectId> <sourceWorkspace> | status <projectId>."""
    import sys

    if len(sys.argv) < 3:
        print(
            "Usage: graphify_store.py persist <projectId> <sourceWorkspace>\n"
            "       graphify_store.py status <projectId>",
            file=sys.stderr,
        )
        return 1

    cmd = sys.argv[1]
    if cmd == "persist":
        if len(sys.argv) < 4:
            print("persist requires projectId and sourceWorkspace", file=sys.stderr)
            return 1
        result = persist_graphify_workspace(sys.argv[2], sys.argv[3])
        print(json.dumps(result))
        return 0
    if cmd == "status":
        result = workspace_ready(sys.argv[2])
        print(json.dumps(result))
        return 0

    print(f"Unknown command: {cmd}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
