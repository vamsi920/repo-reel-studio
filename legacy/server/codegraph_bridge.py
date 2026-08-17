#!/usr/bin/env python3
"""Build a collision-safe JSON payload from the vendored xnuinside/codegraph parser."""

from __future__ import annotations

import argparse
import json
import os
import sys
from argparse import Namespace
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional, Tuple

VENDOR_DIR = os.path.join(os.path.dirname(__file__), "vendor")
if VENDOR_DIR not in sys.path:
    sys.path.insert(0, VENDOR_DIR)

from codegraph.core import CodeGraph  # type: ignore  # noqa: E402


def normalize_path(value: str) -> str:
    return value.replace(os.sep, "/")


def rel_module_path(module_path: str, repo_root: str) -> str:
    return normalize_path(os.path.relpath(module_path, repo_root))


def module_candidates_key(module_path: str) -> List[str]:
    file_name = os.path.basename(module_path)
    module_name = os.path.splitext(file_name)[0]
    keys = [module_name]
    if file_name == "__init__.py":
        package_name = os.path.basename(os.path.dirname(module_path))
        if package_name:
            keys.append(package_name)
    return keys


def module_match_score(candidate: str, module_name: str, current_module: str) -> Tuple[int, int, int, str]:
    current_dir = os.path.dirname(current_module)
    file_name = os.path.basename(candidate)
    score = 0
    if file_name == f"{module_name}.py":
        score += 60
    if module_name == "__init__" and file_name == "__init__.py":
        score += 32
    if current_dir and candidate.startswith(f"{current_dir}/"):
        score += 24
    if os.path.dirname(candidate) == current_dir:
        score += 18
    return (score, -candidate.count("/"), -len(candidate), candidate)


def entity_match_score(candidate_module: str, current_module: str) -> Tuple[int, int, int, str]:
    current_dir = os.path.dirname(current_module)
    score = 0
    if candidate_module == current_module:
        score += 48
    if current_dir and candidate_module.startswith(f"{current_dir}/"):
        score += 20
    if os.path.dirname(candidate_module) == current_dir:
        score += 14
    return (score, -candidate_module.count("/"), -len(candidate_module), candidate_module)


def choose_module(
    module_name: Optional[str],
    module_lookup: Dict[str, List[str]],
    current_module: str,
) -> Optional[str]:
    if not module_name:
        return None
    candidates = module_lookup.get(module_name, [])
    if not candidates:
        return None
    return max(candidates, key=lambda candidate: module_match_score(candidate, module_name, current_module))


def build_dependency_graph(
    usage_graph: Dict[str, Dict[str, List[str]]],
    entity_metadata: Dict[str, Dict[str, Dict[str, Any]]],
    repo_root: str,
) -> Dict[str, Any]:
    module_paths = sorted(usage_graph.keys())
    rel_paths = {
        module_path: rel_module_path(module_path, repo_root) for module_path in module_paths
    }
    module_lookup: Dict[str, List[str]] = defaultdict(list)
    module_entities: Dict[str, Dict[str, Dict[str, Any]]] = {}
    entity_index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    nodes: List[Dict[str, Any]] = []
    links: List[Dict[str, Any]] = []
    node_ids = set()
    structural_link_keys = set()
    dependency_link_keys = set()
    entity_id_lookup: Dict[Tuple[str, str], str] = {}
    module_connection_weights: Dict[Tuple[str, str], int] = defaultdict(int)

    for module_path in module_paths:
        rel_path = rel_paths[module_path]
        for key in module_candidates_key(module_path):
            module_lookup[key].append(rel_path)

        metadata = entity_metadata.get(module_path, {})
        module_entities[rel_path] = metadata
        total_lines = sum(int(item.get("lines", 0) or 0) for item in metadata.values())

        nodes.append(
            {
                "id": rel_path,
                "label": os.path.basename(rel_path),
                "type": "module",
                "fullPath": rel_path,
                "lines": total_lines,
            }
        )
        node_ids.add(rel_path)

        for entity_name, meta in metadata.items():
            entity_id = f"{rel_path}::{entity_name}"
            entity_id_lookup[(rel_path, entity_name)] = entity_id
            entity_payload = {
                "id": entity_id,
                "label": entity_name,
                "type": "entity",
                "parent": rel_path,
                "lines": int(meta.get("lines", 0) or 0),
                "entityType": meta.get("entity_type", "function"),
                "startLine": meta.get("lineno"),
                "endLine": meta.get("endno"),
            }
            nodes.append(entity_payload)
            node_ids.add(entity_id)
            entity_index[entity_name].append(entity_payload)

            structural_key = (rel_path, entity_id, "module-entity")
            if structural_key not in structural_link_keys:
                links.append(
                    {
                        "source": rel_path,
                        "target": entity_id,
                        "type": "module-entity",
                    }
                )
                structural_link_keys.add(structural_key)

    def ensure_external_node(label: str) -> str:
        external_id = f"external::{label}"
        if external_id not in node_ids:
            nodes.append(
                {
                    "id": external_id,
                    "label": label,
                    "type": "external",
                }
            )
            node_ids.add(external_id)
        return external_id

    def resolve_dependency(
        dependency: str,
        source_module: str,
    ) -> Tuple[str, str, Optional[str]]:
        dependency = dependency.strip()
        if not dependency:
            return ("external", ensure_external_node("unknown"), None)

        dep_module_name: Optional[str] = None
        dep_entity_name = dependency
        if "." in dependency:
            dep_module_name, dep_entity_name = dependency.split(".", 1)

        if dep_entity_name == "_" and dep_module_name:
            target_module = choose_module(dep_module_name, module_lookup, source_module)
            if target_module:
                return ("module", target_module, target_module)
            return ("external", ensure_external_node(dep_module_name), None)

        if dep_module_name:
            target_module = choose_module(dep_module_name, module_lookup, source_module)
            if target_module:
                entity_id = entity_id_lookup.get((target_module, dep_entity_name))
                if entity_id:
                    return ("entity", entity_id, target_module)
                return ("module", target_module, target_module)

        local_entity = entity_id_lookup.get((source_module, dep_entity_name))
        if local_entity:
            return ("entity", local_entity, source_module)

        candidates = entity_index.get(dep_entity_name, [])
        if len(candidates) == 1:
            candidate = candidates[0]
            return ("entity", candidate["id"], candidate.get("parent"))
        if len(candidates) > 1:
            sorted_candidates = sorted(
                candidates,
                key=lambda candidate: entity_match_score(candidate.get("parent", ""), source_module),
                reverse=True,
            )
            best = sorted_candidates[0]
            return ("entity", best["id"], best.get("parent"))

        return ("external", ensure_external_node(dependency), None)

    for module_path, module_dependencies in usage_graph.items():
        source_module = rel_paths[module_path]
        for source_name, dependencies in module_dependencies.items():
            source_id = source_module if source_name == "_" else entity_id_lookup.get((source_module, source_name))
            if not source_id:
                continue

            for dependency in dependencies:
                _target_kind, target_id, target_module = resolve_dependency(dependency, source_module)
                link_key = (source_id, target_id, "dependency")
                if link_key in dependency_link_keys:
                    continue

                links.append(
                    {
                        "source": source_id,
                        "target": target_id,
                        "type": "dependency",
                    }
                )
                dependency_link_keys.add(link_key)

                if target_module and target_module != source_module:
                    module_connection_weights[(source_module, target_module)] += 1

    for (source_module, target_module), weight in module_connection_weights.items():
        link_key = (source_module, target_module, "module-module")
        if link_key in dependency_link_keys:
            continue
        links.append(
            {
                "source": source_module,
                "target": target_module,
                "type": "module-module",
                "weight": weight,
            }
        )
        dependency_link_keys.add(link_key)

    linked_modules = set()
    for source_module, target_module in module_connection_weights.keys():
        linked_modules.add(source_module)
        linked_modules.add(target_module)

    unlinked_modules = [
        {"id": rel_path, "fullPath": rel_path}
        for rel_path in sorted(module_entities.keys())
        if rel_path not in linked_modules
    ]

    links_in: Dict[str, int] = defaultdict(int)
    links_out: Dict[str, int] = defaultdict(int)
    for link in links:
        if link["type"] == "module-entity":
            continue
        links_out[link["source"]] += 1
        links_in[link["target"]] += 1

    csv_rows: List[Dict[str, Any]] = []
    node_lookup = {node["id"]: node for node in nodes}
    for node in nodes:
        node_type = node["type"]
        if node_type == "module":
            csv_rows.append(
                {
                    "name": node["label"],
                    "type": "module",
                    "parent_module": "",
                    "full_path": node["fullPath"],
                    "links_out": links_out.get(node["id"], 0),
                    "links_in": links_in.get(node["id"], 0),
                    "lines": node.get("lines", 0),
                }
            )
        elif node_type == "entity":
            csv_rows.append(
                {
                    "name": node["label"],
                    "type": node.get("entityType", "function"),
                    "parent_module": node.get("parent", ""),
                    "full_path": node_lookup.get(node.get("parent", ""), {}).get("fullPath", ""),
                    "links_out": links_out.get(node["id"], 0),
                    "links_in": links_in.get(node["id"], 0),
                    "lines": node.get("lines", 0),
                }
            )
        else:
            csv_rows.append(
                {
                    "name": node.get("label", node["id"]),
                    "type": "external",
                    "parent_module": "",
                    "full_path": "",
                    "links_out": links_out.get(node["id"], 0),
                    "links_in": links_in.get(node["id"], 0),
                    "lines": 0,
                }
            )

    module_index = []
    entity_index_payload = []
    module_dependents: Dict[str, List[str]] = defaultdict(list)
    module_dependencies_map: Dict[str, List[str]] = defaultdict(list)
    for source_module, target_module in module_connection_weights.keys():
        module_dependencies_map[source_module].append(target_module)
        module_dependents[target_module].append(source_module)

    for rel_path, metadata in module_entities.items():
        entity_records = []
        for entity_name, meta in metadata.items():
            entity_id = entity_id_lookup[(rel_path, entity_name)]
            entity_payload = {
                "id": entity_id,
                "name": entity_name,
                "entityType": meta.get("entity_type", "function"),
                "lines": int(meta.get("lines", 0) or 0),
                "startLine": meta.get("lineno"),
                "endLine": meta.get("endno"),
                "linksIn": links_in.get(entity_id, 0),
                "linksOut": links_out.get(entity_id, 0),
            }
            entity_records.append(entity_payload)
            entity_index_payload.append(
                {
                    **entity_payload,
                    "modulePath": rel_path,
                }
            )

        entity_records.sort(
            key=lambda item: (
                item["linksIn"] + item["linksOut"],
                item["lines"],
                item["name"],
            ),
            reverse=True,
        )
        module_index.append(
            {
                "id": rel_path,
                "label": os.path.basename(rel_path),
                "fullPath": rel_path,
                "entityCount": len(entity_records),
                "incomingLinks": links_in.get(rel_path, 0),
                "outgoingLinks": links_out.get(rel_path, 0),
                "lines": sum(item["lines"] for item in entity_records),
                "dependencies": sorted(set(module_dependencies_map.get(rel_path, []))),
                "dependents": sorted(set(module_dependents.get(rel_path, []))),
                "topEntities": entity_records[:8],
            }
        )

    module_index.sort(
        key=lambda item: (
            item["incomingLinks"] + item["outgoingLinks"] + item["entityCount"],
            item["lines"],
            item["fullPath"],
        ),
        reverse=True,
    )
    entity_index_payload.sort(
        key=lambda item: (
            item["linksIn"] + item["linksOut"],
            item["lines"],
            item["modulePath"],
            item["name"],
        ),
        reverse=True,
    )

    hottest_entities = [
        {
            "name": item["name"],
            "modulePath": item["modulePath"],
            "entityType": item["entityType"],
            "lines": item["lines"],
            "linksIn": item["linksIn"],
            "linksOut": item["linksOut"],
        }
        for item in entity_index_payload[:12]
    ]
    most_connected_modules = [
        {
            "fullPath": item["fullPath"],
            "incomingLinks": item["incomingLinks"],
            "outgoingLinks": item["outgoingLinks"],
            "entityCount": item["entityCount"],
        }
        for item in module_index[:12]
    ]
    external_dependencies = [
        {
            "name": row["name"],
            "linksIn": row["links_in"],
        }
        for row in sorted(
            [row for row in csv_rows if row["type"] == "external"],
            key=lambda row: (row["links_in"], row["name"]),
            reverse=True,
        )[:12]
    ]

    return {
        "engine": "xnuinside-codegraph",
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "graph": {
            "nodes": nodes,
            "links": links,
            "unlinkedModules": unlinked_modules,
        },
        "moduleIndex": module_index,
        "entityIndex": entity_index_payload,
        "csvRows": csv_rows,
        "stats": {
            "pythonFileCount": len(module_entities),
            "moduleCount": len(module_entities),
            "entityCount": len(entity_index_payload),
            "externalCount": len([row for row in csv_rows if row["type"] == "external"]),
            "linkCount": len([link for link in links if link["type"] != "module-entity"]),
            "unlinkedModuleCount": len(unlinked_modules),
        },
        "summary": {
            "mostConnectedModules": most_connected_modules,
            "hottestEntities": hottest_entities,
            "externalDependencies": external_dependencies,
        },
    }


def build_payload(repo_root: str) -> Dict[str, Any]:
    args = Namespace(paths=[repo_root], object_only=True, file_path=None, distance=None)
    code_graph = CodeGraph(args)
    usage_graph = code_graph.usage_graph()
    entity_metadata = code_graph.get_entity_metadata()
    return build_dependency_graph(usage_graph, entity_metadata, repo_root)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo_root")
    parsed = parser.parse_args()
    repo_root = os.path.abspath(parsed.repo_root)
    payload = build_payload(repo_root)
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
