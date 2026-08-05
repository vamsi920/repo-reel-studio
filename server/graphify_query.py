"""Run graphify path / explain against a persisted project graphify-out.

Uses the graphify CLI with --graph pointing at
  server/.repo-workspaces/<projectId>/graphify-out/graph.json

Parses CLI stdout into structured JSON for Repo Q&A and GraphExplorer.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

from graphify_store import graphify_out_path, workspace_ready

# FastAPI <--calls [EXTRACTED]-- get_request_handler()
# FastAPI --uses--> DefaultPlaceholder
_HOP_RE = re.compile(
    r"^\s*(?P<left>.+?)\s+"
    r"(?P<arrow><--|--)"
    r"(?P<relation>[a-zA-Z0-9_]+)"
    r"(?:\s*\[(?P<confidence>EXTRACTED|INFERRED)\])?"
    r"(?P<arrow2>--|-->>?)"
    r"\s*(?P<right>.+?)\s*$"
)

# Alternate README style: FastAPI --uses--> DefaultPlaceholder <--references-- fn()
_CHAIN_TOKEN_RE = re.compile(
    r"(?P<node>[A-Za-z0-9_./()+\-]+(?:\([^)]*\))?)"
    r"(?:\s+(?P<link>--[\w]+-->|<--[\w]+(?:\s*\[[^\]]+\])?--))?"
)

_CONN_RE = re.compile(
    r"^\s*(?P<dir>-->|<--)\s+"
    r"(?P<target>.+?)\s+"
    r"\[(?P<relation>[^\]]+)\]\s+"
    r"\[(?P<confidence>EXTRACTED|INFERRED)\]"
    r"(?:\s+(?P<source>.+))?$"
)


class GraphifyQueryError(RuntimeError):
    pass


def find_graphify_binary() -> str:
    binary = shutil.which("graphify")
    if not binary:
        # Prefer project venv next to this file's parent
        venv_bin = Path(__file__).resolve().parents[1] / "venv" / "bin" / "graphify"
        if venv_bin.is_file():
            return str(venv_bin)
        raise GraphifyQueryError("graphify CLI not found on PATH (pip install graphifyy)")
    return binary


def resolve_graph_json(project_id: str) -> Path:
    status = workspace_ready(project_id)
    if not status.get("ready"):
        raise GraphifyQueryError(
            status.get("reason")
            or "graphify workspace not built — re-ingest the project (USE_GRAPHIFY is on by default; set USE_GRAPHIFY=false only to disable)"
        )
    graph_json = graphify_out_path(project_id) / "graph.json"
    if not graph_json.is_file():
        raise GraphifyQueryError(f"Missing graph.json at {graph_json}")
    return graph_json


def _run_graphify_cmd(args: list[str], *, timeout_seconds: int = 60) -> str:
    binary = find_graphify_binary()
    try:
        result = subprocess.run(
            [binary, *args],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise GraphifyQueryError(f"graphify timed out after {timeout_seconds}s") from exc
    except OSError as exc:
        raise GraphifyQueryError(f"graphify failed to launch: {exc}") from exc

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[:2000]
        raise GraphifyQueryError(f"graphify exited {result.returncode}: {detail}")
    return result.stdout or ""


def parse_explain_stdout(text: str) -> dict[str, Any]:
    """Parse `graphify explain` stdout into a structured payload."""
    lines = [ln.rstrip() for ln in (text or "").splitlines()]
    node = source = node_id = node_type = None
    community = degree = None
    connections: list[dict[str, Any]] = []
    in_connections = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("Node:"):
            node = stripped[len("Node:"):].strip()
            continue
        if stripped.startswith("ID:"):
            node_id = stripped[len("ID:"):].strip()
            continue
        if stripped.startswith("Source:"):
            source = stripped[len("Source:"):].strip()
            continue
        if stripped.startswith("Type:"):
            node_type = stripped[len("Type:"):].strip()
            continue
        if stripped.startswith("Community:"):
            raw = stripped[len("Community:"):].strip()
            try:
                community = int(raw)
            except ValueError:
                community = raw
            continue
        if stripped.startswith("Degree:"):
            raw = stripped[len("Degree:"):].strip()
            try:
                degree = int(raw)
            except ValueError:
                degree = raw
            continue
        if stripped.startswith("Connections"):
            in_connections = True
            continue
        if in_connections and stripped:
            match = _CONN_RE.match(stripped)
            if match:
                connections.append({
                    "direction": match.group("dir"),
                    "target": match.group("target").strip(),
                    "relation": match.group("relation").strip(),
                    "confidence": match.group("confidence"),
                    "source": (match.group("source") or "").strip() or None,
                })

    file_path = None
    start_line = None
    if source:
        # e.g. "src/a.py L1" or "routing.py L2210"
        parts = source.rsplit(" ", 1)
        file_path = parts[0]
        if len(parts) == 2 and parts[1].startswith("L"):
            try:
                start_line = int(parts[1][1:])
            except ValueError:
                pass

    return {
        "available": True,
        "kind": "explain",
        "text": text.strip(),
        "node": node,
        "id": node_id,
        "source": source,
        "filePath": file_path,
        "startLine": start_line,
        "type": node_type,
        "community": community,
        "degree": degree,
        "connections": connections,
        "subgraph": {
            "nodeLabels": [n for n in [node, *[c["target"] for c in connections]] if n],
            "nodeIds": [node_id] if node_id else [],
            "edges": [
                {
                    "from": node if c["direction"] == "-->" else c["target"],
                    "to": c["target"] if c["direction"] == "-->" else node,
                    "relation": c["relation"],
                    "confidence": c["confidence"],
                }
                for c in connections
                if node
            ],
        },
    }


def parse_path_stdout(text: str) -> dict[str, Any]:
    """Parse `graphify path` stdout into hops + subgraph."""
    lines = [ln.rstrip() for ln in (text or "").splitlines() if ln.strip()]
    hops_count = None
    hop_line = None
    for line in lines:
        match = re.match(r"Shortest path\s*\((\d+)\s*hops?\):", line, flags=re.I)
        if match:
            hops_count = int(match.group(1))
            continue
        if hops_count is not None and hop_line is None:
            hop_line = line.strip()
            break
        # Sometimes path is on same block without blank line
        if " --" in line or "<--" in line:
            hop_line = line.strip()

    edges: list[dict[str, Any]] = []
    node_labels: list[str] = []

    if hop_line:
        # Split chain: A --rel [CONF]--> B <--rel [CONF]-- C
        # Walk left-to-right consuming link tokens.
        remaining = hop_line
        # Pattern for one hop segment ending at next node
        segment_re = re.compile(
            r"^(?P<node>.+?)\s+"
            r"(?P<link>"
            r"--(?P<rel1>[a-zA-Z0-9_]+)(?:\s*\[(?P<conf1>EXTRACTED|INFERRED)\])?-->"
            r"|"
            r"<--(?P<rel2>[a-zA-Z0-9_]+)(?:\s*\[(?P<conf2>EXTRACTED|INFERRED)\])?--"
            r")\s*"
        )
        while True:
            m = segment_re.match(remaining)
            if not m:
                # final node
                final = remaining.strip()
                if final:
                    node_labels.append(final)
                break
            left = m.group("node").strip()
            node_labels.append(left)
            if m.group("rel1"):
                relation = m.group("rel1")
                confidence = m.group("conf1") or "EXTRACTED"
                direction = "forward"
            else:
                relation = m.group("rel2")
                confidence = m.group("conf2") or "EXTRACTED"
                direction = "backward"
            rest = remaining[m.end():]
            # next node is start of rest until next link or end
            next_m = segment_re.match(rest)
            right = (next_m.group("node") if next_m else rest).strip()
            # If next_m, right is only the node part; else whole rest
            if next_m:
                right = next_m.group("node").strip()
            else:
                # strip trailing nothing
                right = rest.strip()
            edges.append({
                "from": left if direction == "forward" else right,
                "to": right if direction == "forward" else left,
                "relation": relation,
                "confidence": confidence,
                "direction": direction,
                "label": f"{left} {'--' + relation + '-->' if direction == 'forward' else '<--' + relation + '--'} {right}",
            })
            remaining = rest

    # Dedupe labels preserving order
    seen: set[str] = set()
    unique_labels: list[str] = []
    for label in node_labels:
        if label and label not in seen:
            seen.add(label)
            unique_labels.append(label)

    return {
        "available": True,
        "kind": "path",
        "text": text.strip(),
        "hops": hops_count if hops_count is not None else max(0, len(edges)),
        "edges": edges,
        "subgraph": {
            "nodeLabels": unique_labels,
            "nodeIds": [],
            "edges": [
                {
                    "from": e["from"],
                    "to": e["to"],
                    "relation": e["relation"],
                    "confidence": e["confidence"],
                }
                for e in edges
            ],
        },
    }


def explain_concept(project_id: str, label: str, *, timeout_seconds: int = 60) -> dict[str, Any]:
    graph_json = resolve_graph_json(project_id)
    stdout = _run_graphify_cmd(
        ["explain", label, "--graph", str(graph_json)],
        timeout_seconds=timeout_seconds,
    )
    parsed = parse_explain_stdout(stdout)
    parsed["projectId"] = project_id
    parsed["label"] = label
    return parsed


def find_shortest_path(
    project_id: str,
    from_label: str,
    to_label: str,
    *,
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    graph_json = resolve_graph_json(project_id)
    stdout = _run_graphify_cmd(
        ["path", from_label, to_label, "--graph", str(graph_json)],
        timeout_seconds=timeout_seconds,
    )
    parsed = parse_path_stdout(stdout)
    parsed["projectId"] = project_id
    parsed["from"] = from_label
    parsed["to"] = to_label
    return parsed


def unavailable_payload(reason: str, **extra: Any) -> dict[str, Any]:
    return {"available": False, "reason": reason, **extra}


def main() -> int:
    parser = argparse.ArgumentParser(description="graphify path/explain against a project workspace")
    sub = parser.add_subparsers(dest="command", required=True)

    p_status = sub.add_parser("status")
    p_status.add_argument("project_id")

    p_explain = sub.add_parser("explain")
    p_explain.add_argument("project_id")
    p_explain.add_argument("label")
    p_explain.add_argument("--timeout", type=int, default=60)

    p_path = sub.add_parser("path")
    p_path.add_argument("project_id")
    p_path.add_argument("from_label")
    p_path.add_argument("to_label")
    p_path.add_argument("--timeout", type=int, default=60)

    args = parser.parse_args()

    try:
        if args.command == "status":
            print(json.dumps(workspace_ready(args.project_id)))
            return 0
        if args.command == "explain":
            print(json.dumps(explain_concept(args.project_id, args.label, timeout_seconds=args.timeout)))
            return 0
        if args.command == "path":
            print(json.dumps(find_shortest_path(
                args.project_id, args.from_label, args.to_label, timeout_seconds=args.timeout,
            )))
            return 0
    except GraphifyQueryError as exc:
        print(json.dumps(unavailable_payload(str(exc))), file=sys.stdout)
        return 0  # soft-fail: callers get available:false JSON
    except Exception as exc:
        print(json.dumps(unavailable_payload(str(exc))), file=sys.stdout)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
