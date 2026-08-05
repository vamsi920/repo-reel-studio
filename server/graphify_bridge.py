#!/usr/bin/env python3
"""Run `graphify extract` as a subprocess and adapt its graph.json into this
app's GitNexusGraphData shape (see src/lib/types.ts).

Graphify's real output schema (verified by running graphify==0.9.33 against
fixture repos, not just its README, since the README turned out to lag the
actual CLI/JSON shape):

  node: {id, label, file_type: "code"|"rationale"|..., source_file,
         source_location: "L<n>", _origin: "ast", _callable?, _callable_class?,
         community?: int, norm_label}
  edge (graph.json key is "links" once clustering runs, "edges" pre-cluster):
        {source, target, relation: "contains"|"imports"|"imports_from"|
         "calls"|"inherits"|"implements"|"method"|"rationale_for", context?,
         confidence: "EXTRACTED"|"INFERRED", confidence_score?: float, weight}

There is no explicit node "kind" enum and no per-node Degree field -- kind is
inferred from file_type/_callable*/label shape, and centrality is left to be
computed by the caller from edge counts (see graphify_centrality.py).

"rationale_for" edges link a TODO/comment node straight to the function/class
it annotates -- structured, graph-located TODO extraction. Not translated to
a GitNexusEdge here (no matching concept in that closed union); it is the
intended input for the proactive agent's centrality/candidate work instead of
this bridge's own output.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

NODE_KIND_FILE = "File"
NODE_KIND_FUNCTION = "Function"
NODE_KIND_CLASS = "Class"
NODE_KIND_METHOD = "Method"
NODE_KIND_VARIABLE = "Variable"

# Valid GitNexusNode.kind / GitNexusEdge.type values (src/lib/types.ts). Kept
# as an explicit guard so a future Graphify schema drift fails loudly here
# instead of silently emitting a value the frontend's closed union rejects.
VALID_NODE_KINDS = frozenset(
    {"File", "Function", "Class", "Method", "Interface", "Module", "Component", "Hook", "Enum", "Variable"}
)
VALID_EDGE_TYPES = frozenset(
    {"IMPORTS", "CALLS", "EXTENDS", "IMPLEMENTS", "MEMBER_OF", "DEFINED_IN", "EXPORTS", "USES_TYPE", "TESTS"}
)

# relation -> GitNexusEdge.type. "contains" maps to DEFINED_IN but with
# source/target swapped: Graphify's "contains" is file->symbol, DEFINED_IN is
# symbol->file. "rationale_for" has no equivalent and is intentionally
# dropped (see module docstring).
EDGE_TYPE_MAP = {
    "imports": "IMPORTS",
    "imports_from": "IMPORTS",
    "calls": "CALLS",
    "inherits": "EXTENDS",
    "implements": "IMPLEMENTS",
    "method": "MEMBER_OF",
    "contains": "DEFINED_IN",
}
DEFINED_IN_SWAPS_DIRECTION = {"contains"}

CONFIDENCE_FALLBACK = {"EXTRACTED": 0.95, "INFERRED": 0.6}


class GraphifyBridgeError(RuntimeError):
    pass


def find_graphify_binary() -> str:
    binary = shutil.which("graphify")
    if not binary:
        venv_bin = Path(__file__).resolve().parents[1] / "venv" / "bin" / "graphify"
        if venv_bin.is_file():
            return str(venv_bin)
        raise GraphifyBridgeError("graphify CLI not found on PATH (pip install graphifyy)")
    return binary


def run_graphify_extract(workspace: Path, *, timeout_seconds: int = 120) -> Path:
    """Run `graphify extract <workspace> --code-only` and return the graph.json path.

    --code-only: local AST extraction only, no API key, no LLM call -- keeps
    this fully local/deterministic (never pass --backend here).
    """
    binary = find_graphify_binary()
    try:
        result = subprocess.run(
            [binary, "extract", str(workspace), "--code-only"],
            cwd=str(workspace),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise GraphifyBridgeError(f"graphify extract timed out after {timeout_seconds}s") from exc
    except OSError as exc:
        raise GraphifyBridgeError(f"graphify extract failed to launch: {exc}") from exc

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[:2000]
        raise GraphifyBridgeError(f"graphify extract exited {result.returncode}: {detail}")

    graph_path = workspace / "graphify-out" / "graph.json"
    if not graph_path.is_file():
        raise GraphifyBridgeError(f"graphify extract did not produce {graph_path}")
    return graph_path


def _parse_start_line(source_location: Any) -> Optional[int]:
    text = str(source_location or "")
    if not text.startswith("L"):
        return None
    try:
        return int(text[1:])
    except ValueError:
        return None


def classify_node_kind(node: dict[str, Any], method_targets: set[str]) -> str:
    if node.get("file_type") != "code":
        return NODE_KIND_VARIABLE
    if node.get("_callable_class"):
        return NODE_KIND_CLASS
    if node.get("_callable"):
        return NODE_KIND_METHOD if str(node.get("id")) in method_targets else NODE_KIND_FUNCTION
    label = str(node.get("label") or "")
    source_file = str(node.get("source_file") or "")
    if source_file and label == Path(source_file).name:
        return NODE_KIND_FILE
    return NODE_KIND_VARIABLE


def adapt_graphify_output(graph_json: dict[str, Any], *, repo_name: str = "") -> dict[str, Any]:
    """Map Graphify's graph.json into GitNexusGraphData (src/lib/types.ts)."""
    raw_nodes = graph_json.get("nodes") or []
    raw_edges = graph_json.get("links") or graph_json.get("edges") or []

    method_targets = {str(edge.get("target")) for edge in raw_edges if edge.get("relation") == "method"}

    nodes: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for raw_node in raw_nodes:
        node_id = str(raw_node.get("id") or "").strip()
        if not node_id or node_id in seen_ids:
            continue
        seen_ids.add(node_id)
        kind = classify_node_kind(raw_node, method_targets)
        if kind not in VALID_NODE_KINDS:
            kind = NODE_KIND_VARIABLE
        community = raw_node.get("community")
        tags = [str(t) for t in (raw_node.get("file_type"), "graphify") if t]
        nodes.append(
            {
                "id": node_id,
                "name": str(raw_node.get("label") or node_id),
                "kind": kind,
                "filePath": str(raw_node.get("source_file") or ""),
                "startLine": _parse_start_line(raw_node.get("source_location")),
                "cluster": str(community) if community is not None else None,
                "tags": tags,
            }
        )

    edges: list[dict[str, Any]] = []
    for raw_edge in raw_edges:
        relation = str(raw_edge.get("relation") or "")
        mapped_type = EDGE_TYPE_MAP.get(relation)
        if not mapped_type or mapped_type not in VALID_EDGE_TYPES:
            continue  # e.g. "rationale_for" -- no GitNexusEdge equivalent, dropped
        source_id = str(raw_edge.get("source") or "")
        target_id = str(raw_edge.get("target") or "")
        if relation in DEFINED_IN_SWAPS_DIRECTION:
            source_id, target_id = target_id, source_id
        if source_id not in seen_ids or target_id not in seen_ids:
            continue
        confidence_tag = str(raw_edge.get("confidence") or "EXTRACTED")
        confidence = raw_edge.get("confidence_score")
        if not isinstance(confidence, (int, float)):
            confidence = CONFIDENCE_FALLBACK.get(confidence_tag, 0.7)
        edges.append({"source": source_id, "target": target_id, "type": mapped_type, "confidence": float(confidence)})

    clusters_by_id: dict[str, list[str]] = {}
    for node in nodes:
        cluster_id = node.get("cluster")
        if cluster_id is None:
            continue
        clusters_by_id.setdefault(cluster_id, []).append(node["id"])
    clusters = [
        {"id": cluster_id, "label": f"Community {cluster_id}", "members": members}
        for cluster_id, members in sorted(clusters_by_id.items())
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "clusters": clusters,
        "processes": [],
        "summary": {
            "repoName": repo_name,
            "totalFiles": len([n for n in nodes if n["kind"] == NODE_KIND_FILE]),
            "totalSymbols": len(nodes),
            "totalEdges": len(edges),
            "languages": {},
            "entryPoints": [],
            "hubFiles": [],
            "keyTechnologies": ["graphify"],
        },
    }


def build_graphify_graph(
    workspace: Path,
    *,
    repo_name: str = "",
    timeout_seconds: int = 120,
    keep_graphify_out: bool = False,
) -> dict[str, Any]:
    """Run extraction and return the adapted graph.

    By default removes the `graphify-out/` directory `graphify extract` writes
    into `workspace` before returning (success or failure). Callers that pass
    a throwaway staged temp dir (Milestone 1's Node bridge) don't strictly
    need this since the whole temp dir gets wiped afterward anyway, but
    callers that run this against a live, reused workspace (Milestone 2's
    proactive-agent centrality, see graphify_centrality.py) do: leaving
    graphify-out/graph.json behind pollutes that workspace for any later
    re-scan (list_repo_files() would treat it as a scannable file, and its
    JSON content can itself contain substrings that look like TODO/FIXME
    markers -- this broke test_dry_run_is_deterministic before this fix), and
    it would get swept into the sandbox's git baseline commit.

    Set keep_graphify_out=True when the caller will copy graphify-out/ to a
    persistent store (see graphify_store.persist_graphify_workspace) before
    deleting the temp workspace.
    """
    graphify_out_dir = workspace / "graphify-out"
    try:
        graph_path = run_graphify_extract(workspace, timeout_seconds=timeout_seconds)
        graph_json = json.loads(graph_path.read_text(encoding="utf-8"))
        return adapt_graphify_output(graph_json, repo_name=repo_name)
    finally:
        if not keep_graphify_out:
            shutil.rmtree(graphify_out_dir, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run graphify extract and adapt output to GitNexusGraphData")
    parser.add_argument("workspace", help="Directory to extract (staged repo files)")
    parser.add_argument("--repo-name", default="")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument(
        "--keep-graphify-out",
        action="store_true",
        help="Leave workspace/graphify-out in place after extract (for persist)",
    )
    parser.add_argument(
        "--persist-project-id",
        default="",
        help="If set, copy graphify-out into .repo-workspaces/<id>/ before cleanup",
    )
    args = parser.parse_args()

    workspace = Path(args.workspace).resolve()
    if not workspace.is_dir():
        print(f"workspace not found: {workspace}", file=sys.stderr)
        return 1

    persist_id = (args.persist_project_id or "").strip()
    keep = bool(args.keep_graphify_out or persist_id)

    try:
        adapted = build_graphify_graph(
            workspace,
            repo_name=args.repo_name,
            timeout_seconds=args.timeout,
            keep_graphify_out=keep,
        )
    except GraphifyBridgeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    graphify_workspace = None
    if persist_id:
        try:
            from graphify_store import persist_graphify_workspace

            graphify_workspace = persist_graphify_workspace(
                persist_id,
                workspace,
                adapted_summary=adapted.get("summary"),
            )
        except Exception as exc:
            print(f"graphify persist failed: {exc}", file=sys.stderr)
            # Still emit adapted graph; persist failure is non-fatal for ingest
            graphify_workspace = {
                "ready": False,
                "projectId": persist_id,
                "reason": str(exc),
            }
        finally:
            if not args.keep_graphify_out:
                shutil.rmtree(workspace / "graphify-out", ignore_errors=True)

    payload = adapted
    if graphify_workspace is not None:
        payload = {**adapted, "graphifyWorkspace": graphify_workspace}

    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
