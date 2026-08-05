from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import graphify_bridge as bridge  # noqa: E402

HAVE_GRAPHIFY = shutil.which("graphify") is not None


class ClassifyNodeKindTests(unittest.TestCase):
    def test_rationale_node_is_variable(self) -> None:
        node = {"file_type": "rationale", "label": "TODO: fix this"}
        self.assertEqual(bridge.classify_node_kind(node, set()), bridge.NODE_KIND_VARIABLE)

    def test_callable_class_is_class(self) -> None:
        node = {"file_type": "code", "_callable": True, "_callable_class": True, "id": "x"}
        self.assertEqual(bridge.classify_node_kind(node, set()), bridge.NODE_KIND_CLASS)

    def test_callable_target_of_method_edge_is_method(self) -> None:
        node = {"file_type": "code", "_callable": True, "id": "x_compute"}
        self.assertEqual(bridge.classify_node_kind(node, {"x_compute"}), bridge.NODE_KIND_METHOD)

    def test_callable_not_a_method_target_is_function(self) -> None:
        node = {"file_type": "code", "_callable": True, "id": "x_add"}
        self.assertEqual(bridge.classify_node_kind(node, set()), bridge.NODE_KIND_FUNCTION)

    def test_label_matching_source_file_basename_is_file(self) -> None:
        node = {"file_type": "code", "label": "index.js", "source_file": "src/index.js", "id": "src_index"}
        self.assertEqual(bridge.classify_node_kind(node, set()), bridge.NODE_KIND_FILE)

    def test_unrecognized_shape_falls_back_to_variable(self) -> None:
        node = {"file_type": "code", "label": "mystery", "source_file": "src/x.js", "id": "x"}
        self.assertEqual(bridge.classify_node_kind(node, set()), bridge.NODE_KIND_VARIABLE)


class AdaptGraphifyOutputTests(unittest.TestCase):
    def _fixture_graph(self) -> dict:
        # Shaped like real `graphify extract --code-only` output (verified
        # against graphify==0.9.33), not the README's aspirational schema.
        return {
            "nodes": [
                {"id": "src_index", "label": "index.js", "file_type": "code", "source_file": "src/index.js",
                 "source_location": "L1", "community": 0},
                {"id": "src_index_main", "label": "main()", "file_type": "code", "source_file": "src/index.js",
                 "source_location": "L4", "_callable": True, "community": 1},
                {"id": "src_index_rationale_3", "label": "TODO: handle errors", "file_type": "rationale",
                 "source_file": "src/index.js", "source_location": "L3", "community": 0},
                {"id": "src_utils", "label": "utils.js", "file_type": "code", "source_file": "src/utils.js",
                 "source_location": "L1", "community": 0},
                {"id": "src_utils_add", "label": "add()", "file_type": "code", "source_file": "src/utils.js",
                 "source_location": "L1", "_callable": True, "community": 1},
                {"id": "src_utils_calculator", "label": "Calculator", "file_type": "code",
                 "source_file": "src/utils.js", "source_location": "L5", "_callable": True,
                 "_callable_class": True, "community": 0},
                {"id": "src_utils_calculator_compute", "label": ".compute()", "file_type": "code",
                 "source_file": "src/utils.js", "source_location": "L6", "_callable": True, "community": 1},
            ],
            "links": [
                {"source": "src_index", "target": "src_index_main", "relation": "contains",
                 "confidence": "EXTRACTED", "confidence_score": 1.0},
                {"source": "src_index", "target": "src_utils", "relation": "imports_from",
                 "confidence": "EXTRACTED", "confidence_score": 1.0},
                {"source": "src_index", "target": "src_utils_add", "relation": "imports",
                 "confidence": "EXTRACTED", "confidence_score": 1.0},
                {"source": "src_index_rationale_3", "target": "src_index", "relation": "rationale_for",
                 "confidence": "EXTRACTED", "confidence_score": 1.0},
                {"source": "src_index_main", "target": "src_utils_add", "relation": "calls",
                 "confidence": "EXTRACTED", "confidence_score": 1.0},
                {"source": "src_utils", "target": "src_utils_calculator", "relation": "contains",
                 "confidence": "EXTRACTED", "confidence_score": 1.0},
                {"source": "src_utils_calculator", "target": "src_utils_calculator_compute", "relation": "method",
                 "confidence": "EXTRACTED", "confidence_score": 1.0},
            ],
        }

    def test_node_kinds_and_file_paths(self) -> None:
        adapted = bridge.adapt_graphify_output(self._fixture_graph(), repo_name="fixture")
        by_id = {n["id"]: n for n in adapted["nodes"]}
        self.assertEqual(by_id["src_index"]["kind"], "File")
        self.assertEqual(by_id["src_index_main"]["kind"], "Function")
        self.assertEqual(by_id["src_utils_calculator"]["kind"], "Class")
        self.assertEqual(by_id["src_utils_calculator_compute"]["kind"], "Method")
        self.assertEqual(by_id["src_index_rationale_3"]["kind"], "Variable")
        self.assertEqual(by_id["src_index_main"]["filePath"], "src/index.js")
        self.assertEqual(by_id["src_index_main"]["startLine"], 4)

    def test_edge_types_and_defined_in_direction_swap(self) -> None:
        adapted = bridge.adapt_graphify_output(self._fixture_graph())
        by_type: dict[str, list[dict]] = {}
        for edge in adapted["edges"]:
            by_type.setdefault(edge["type"], []).append(edge)

        self.assertIn("IMPORTS", by_type)
        self.assertIn("CALLS", by_type)
        self.assertIn("MEMBER_OF", by_type)

        # "contains" (src_index -> src_index_main) must come out reversed as
        # DEFINED_IN (src_index_main -> src_index).
        defined_in = by_type["DEFINED_IN"]
        pairs = {(e["source"], e["target"]) for e in defined_in}
        self.assertIn(("src_index_main", "src_index"), pairs)
        self.assertIn(("src_utils_calculator", "src_utils"), pairs)

    def test_rationale_for_edge_is_dropped(self) -> None:
        adapted = bridge.adapt_graphify_output(self._fixture_graph())
        sources = {e["source"] for e in adapted["edges"]}
        # src_index_rationale_3's only edge is "rationale_for" -- must not
        # appear as an edge source since that relation has no GitNexusEdge
        # equivalent and is intentionally dropped.
        self.assertNotIn("src_index_rationale_3", sources)

    def test_all_kinds_and_types_are_in_the_closed_unions(self) -> None:
        adapted = bridge.adapt_graphify_output(self._fixture_graph())
        for node in adapted["nodes"]:
            self.assertIn(node["kind"], bridge.VALID_NODE_KINDS)
        for edge in adapted["edges"]:
            self.assertIn(edge["type"], bridge.VALID_EDGE_TYPES)

    def test_clusters_built_from_community_field(self) -> None:
        adapted = bridge.adapt_graphify_output(self._fixture_graph())
        cluster_ids = {c["id"] for c in adapted["clusters"]}
        self.assertEqual(cluster_ids, {"0", "1"})

    def test_confidence_score_used_when_present_else_falls_back_by_tag(self) -> None:
        graph = self._fixture_graph()
        graph["links"][0]["confidence_score"] = 0.42
        graph["links"].append(
            {"source": "src_index", "target": "src_utils_calculator", "relation": "calls",
             "confidence": "INFERRED"}  # no confidence_score -- must fall back by tag
        )
        adapted = bridge.adapt_graphify_output(graph)
        by_pair = {(e["source"], e["target"]): e["confidence"] for e in adapted["edges"]}
        self.assertAlmostEqual(by_pair[("src_index_main", "src_index")], 0.42)
        self.assertAlmostEqual(by_pair[("src_index", "src_utils_calculator")], 0.6)

    def test_edges_referencing_dropped_nodes_are_skipped(self) -> None:
        graph = self._fixture_graph()
        graph["links"].append(
            {"source": "src_index", "target": "does_not_exist", "relation": "calls", "confidence": "EXTRACTED"}
        )
        adapted = bridge.adapt_graphify_output(graph)
        targets = {e["target"] for e in adapted["edges"]}
        self.assertNotIn("does_not_exist", targets)


@unittest.skipUnless(HAVE_GRAPHIFY, "graphify CLI not installed (pip install graphifyy)")
class GraphifyExtractIntegrationTests(unittest.TestCase):
    """Runs the real `graphify` binary end-to-end. Skipped in environments
    without it installed -- the unit tests above cover adapter correctness
    without requiring the binary."""

    def setUp(self) -> None:
        self.workspace = Path(tempfile.mkdtemp(prefix="graphify-bridge-test-"))
        (self.workspace / "src").mkdir()
        (self.workspace / "src" / "utils.js").write_text(
            "export function add(a, b) {\n  return a + b;\n}\n", encoding="utf-8"
        )
        (self.workspace / "src" / "index.js").write_text(
            'import { add } from "./utils.js";\n// TODO: handle errors\nfunction main() {\n  add(1, 2);\n}\nmain();\n',
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        shutil.rmtree(self.workspace, ignore_errors=True)

    def test_build_graphify_graph_end_to_end(self) -> None:
        result = bridge.build_graphify_graph(self.workspace, repo_name="itest", timeout_seconds=60)
        self.assertGreater(len(result["nodes"]), 0)
        self.assertGreater(len(result["edges"]), 0)
        for node in result["nodes"]:
            self.assertIn(node["kind"], bridge.VALID_NODE_KINDS)
        for edge in result["edges"]:
            self.assertIn(edge["type"], bridge.VALID_EDGE_TYPES)
        import_edges = [e for e in result["edges"] if e["type"] == "IMPORTS"]
        self.assertTrue(import_edges, "expected at least one IMPORTS edge from the real extraction")

    def test_build_graphify_graph_cleans_up_graphify_out(self) -> None:
        # graphify extract writes graphify-out/graph.json directly into the
        # workspace it scans. Left behind, that pollutes any later re-scan of
        # the same workspace (list_repo_files() would treat it as a
        # scannable file, and the JSON can itself contain TODO-like
        # substrings) -- see graphify_bridge.py's build_graphify_graph
        # docstring. This must never be left on disk after the call returns.
        bridge.build_graphify_graph(self.workspace, timeout_seconds=60)
        self.assertFalse((self.workspace / "graphify-out").exists())

    def test_build_graphify_graph_cleans_up_even_on_adapter_failure(self) -> None:
        with patch.object(bridge, "adapt_graphify_output", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                bridge.build_graphify_graph(self.workspace, timeout_seconds=60)
        self.assertFalse((self.workspace / "graphify-out").exists())

    def test_missing_binary_raises_bridge_error(self) -> None:
        original_which = shutil.which
        try:
            shutil.which = lambda name: None  # type: ignore[assignment]
            with self.assertRaises(bridge.GraphifyBridgeError):
                bridge.build_graphify_graph(self.workspace)
        finally:
            shutil.which = original_which


if __name__ == "__main__":
    unittest.main()
