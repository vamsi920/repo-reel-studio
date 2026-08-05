from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import graphify_centrality as centrality  # noqa: E402


def _fixture_graph() -> dict:
    # Shaped like graphify_bridge.py's adapted GitNexusGraphData output.
    return {
        "nodes": [
            {"id": "src_index", "filePath": "src/index.js", "kind": "File"},
            {"id": "src_index_main", "filePath": "src/index.js", "kind": "Function"},
            {"id": "src_utils", "filePath": "src/utils.js", "kind": "File"},
            {"id": "src_utils_add", "filePath": "src/utils.js", "kind": "Function"},
            {"id": "src_widget", "filePath": "src/widget.js", "kind": "File"},
        ],
        "edges": [
            {"source": "src_index", "target": "src_utils", "type": "IMPORTS", "confidence": 0.95},
            {"source": "src_index", "target": "src_utils_add", "type": "IMPORTS", "confidence": 0.95},
            {"source": "src_index_main", "target": "src_utils_add", "type": "CALLS", "confidence": 0.95},
            {"source": "src_widget", "target": "src_utils", "type": "IMPORTS", "confidence": 0.6},
            # MEMBER_OF should not count toward centrality.
            {"source": "src_index", "target": "src_index_main", "type": "MEMBER_OF", "confidence": 0.95},
        ],
    }


class CentralityFromGraphTests(unittest.TestCase):
    def test_counts_incoming_import_and_call_edges_per_file(self) -> None:
        files = ["src/index.js", "src/utils.js", "src/widget.js"]
        counts = centrality.centrality_from_graph(_fixture_graph(), files)
        # utils.js is imported by both index.js and widget.js -- and index_main
        # calls into it too, but that's the same target file, still counted
        # per import/call edge (2 IMPORTS to utils.js/utils_add-in-utils.js
        # collapse to the same target file plus the CALLS edge and widget's
        # IMPORTS edge).
        self.assertGreaterEqual(counts["src/utils.js"], 3)
        self.assertEqual(counts["src/widget.js"], 0)  # nothing imports/calls into widget.js

    def test_self_references_are_not_counted(self) -> None:
        graph = {
            "nodes": [{"id": "a", "filePath": "a.js", "kind": "File"}, {"id": "a_fn", "filePath": "a.js", "kind": "Function"}],
            "edges": [{"source": "a", "target": "a_fn", "type": "CALLS", "confidence": 0.9}],
        }
        counts = centrality.centrality_from_graph(graph, ["a.js"])
        self.assertEqual(counts["a.js"], 0)

    def test_member_of_and_defined_in_edges_do_not_contribute(self) -> None:
        graph = {
            "nodes": [
                {"id": "cls", "filePath": "a.js", "kind": "Class"},
                {"id": "method", "filePath": "a.js", "kind": "Method"},
                {"id": "b", "filePath": "b.js", "kind": "File"},
            ],
            "edges": [
                {"source": "cls", "target": "method", "type": "MEMBER_OF", "confidence": 0.9},
                {"source": "method", "target": "b", "type": "DEFINED_IN", "confidence": 0.9},
            ],
        }
        counts = centrality.centrality_from_graph(graph, ["a.js", "b.js"])
        self.assertEqual(counts["a.js"], 0)
        self.assertEqual(counts["b.js"], 0)

    def test_all_files_present_in_output_even_with_zero_count(self) -> None:
        files = ["a.js", "b.js", "c.js"]
        counts = centrality.centrality_from_graph({"nodes": [], "edges": []}, files)
        self.assertEqual(set(counts.keys()), set(files))
        self.assertTrue(all(v == 0 for v in counts.values()))

    def test_values_stay_within_score_centrality_component_range(self) -> None:
        # score_centrality_component() in proactive_candidate_score.py does
        # min(1.0, centrality / 8) -- values should be small non-negative
        # ints for a small fixture, not something wildly out of range.
        files = ["src/index.js", "src/utils.js", "src/widget.js"]
        counts = centrality.centrality_from_graph(_fixture_graph(), files)
        for value in counts.values():
            self.assertGreaterEqual(value, 0)
            self.assertLess(value, 8)


class GraphifyCentralityEnabledTests(unittest.TestCase):
    def test_default_is_enabled(self) -> None:
        with patch.dict("os.environ", {}, clear=False):
            import os

            os.environ.pop("PROACTIVE_GRAPHIFY_CENTRALITY", None)
            self.assertTrue(centrality.graphify_centrality_enabled())

    def test_falsey_values_disable(self) -> None:
        import os

        for value in ("0", "false", "no", "off"):
            with patch.dict(os.environ, {"PROACTIVE_GRAPHIFY_CENTRALITY": value}):
                self.assertFalse(centrality.graphify_centrality_enabled())


if __name__ == "__main__":
    unittest.main()
