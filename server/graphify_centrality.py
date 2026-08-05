"""Graph-derived centrality for the proactive agent.

Replaces server/proactive_orchestrator.py's build_import_counts() -- which
regex-matches filename stems as quoted strings across up to 1200 files' raw
text -- with real IMPORTS/CALLS edge degree from Graphify (see
graphify_bridge.py). Falls back to the regex heuristic on any failure; see
_graphify_centrality_enabled() in proactive_orchestrator.py for the flag/
fallback wiring.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from graphify_bridge import GraphifyBridgeError, build_graphify_graph

__all__ = [
    "GraphifyBridgeError",
    "graphify_centrality_enabled",
    "load_graphify_graph",
    "centrality_from_graph",
    "centrality_via_graphify",
]


def graphify_centrality_enabled() -> bool:
    return os.getenv("PROACTIVE_GRAPHIFY_CENTRALITY", "").strip().lower() not in ("0", "false", "no", "off")


def load_graphify_graph(workspace: Path, *, timeout_seconds: int = 60) -> dict[str, Any]:
    """Run `graphify extract` via the shared bridge; returns GitNexusGraphData."""
    return build_graphify_graph(workspace, timeout_seconds=timeout_seconds)


def centrality_from_graph(graph: dict[str, Any], files: list[str]) -> dict[str, int]:
    """File path -> centrality count, derived from real IMPORTS/CALLS edges.

    Counts, for each file, how many *other* files reference something inside
    it (via an IMPORTS or CALLS edge) -- the same "how many tracked files
    reference me" semantics build_import_counts() approximated with regex.
    Kept in the same rough numeric range (small non-negative ints) so
    score_centrality_component()'s `min(1.0, centrality/8)` normalization in
    proactive_candidate_score.py needs no reweighting.
    """
    file_paths = set(files)
    node_file: dict[str, str] = {}
    for node in graph.get("nodes") or []:
        file_path = node.get("filePath")
        node_id = node.get("id")
        if file_path and node_id:
            node_file[node_id] = file_path

    counts: dict[str, int] = {path: 0 for path in files}
    for edge in graph.get("edges") or []:
        if edge.get("type") not in ("IMPORTS", "CALLS"):
            continue
        source_file = node_file.get(edge.get("source"))
        target_file = node_file.get(edge.get("target"))
        if target_file and target_file in file_paths and target_file != source_file:
            counts[target_file] = counts.get(target_file, 0) + 1

    return counts


def centrality_via_graphify(workspace: Path, files: list[str], *, timeout_seconds: int = 60) -> dict[str, int]:
    graph = load_graphify_graph(workspace, timeout_seconds=timeout_seconds)
    return centrality_from_graph(graph, files)
