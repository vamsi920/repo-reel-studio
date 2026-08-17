from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import graphify_query as gq  # noqa: E402
import graphify_store as gs  # noqa: E402

EXPLAIN_FIXTURE = """\
Node: FastAPI
  ID:        src_a_fastapi
  Source:    src/a.py L1
  Type:      code
  Community: 1
  Degree:    2

Connections (2):
  <-- a.py [contains] [EXTRACTED] src/a.py:L1
  <-- get_request_handler() [calls] [EXTRACTED] src/a.py:L5
"""

PATH_FIXTURE = """\
Shortest path (1 hops):
  FastAPI <--calls [EXTRACTED]-- get_request_handler()
"""

PATH_MULTI_FIXTURE = """\
Shortest path (3 hops):
  FastAPI --uses--> DefaultPlaceholder <--references-- get_request_handler() --references--> ModelField
"""


class ParseExplainTests(unittest.TestCase):
    def test_parses_node_and_connections(self) -> None:
        result = gq.parse_explain_stdout(EXPLAIN_FIXTURE)
        self.assertTrue(result["available"])
        self.assertEqual(result["node"], "FastAPI")
        self.assertEqual(result["id"], "src_a_fastapi")
        self.assertEqual(result["filePath"], "src/a.py")
        self.assertEqual(result["startLine"], 1)
        self.assertEqual(result["degree"], 2)
        self.assertEqual(len(result["connections"]), 2)
        self.assertEqual(result["connections"][1]["relation"], "calls")
        self.assertEqual(result["connections"][1]["confidence"], "EXTRACTED")
        self.assertIn("FastAPI", result["subgraph"]["nodeLabels"])


class ParsePathTests(unittest.TestCase):
    def test_parses_single_hop_backward(self) -> None:
        result = gq.parse_path_stdout(PATH_FIXTURE)
        self.assertTrue(result["available"])
        self.assertEqual(result["hops"], 1)
        self.assertEqual(len(result["edges"]), 1)
        edge = result["edges"][0]
        self.assertEqual(edge["relation"], "calls")
        self.assertEqual(edge["confidence"], "EXTRACTED")
        self.assertEqual(edge["from"], "get_request_handler()")
        self.assertEqual(edge["to"], "FastAPI")
        self.assertEqual(result["subgraph"]["nodeLabels"], ["FastAPI", "get_request_handler()"])

    def test_parses_multi_hop_readme_style(self) -> None:
        result = gq.parse_path_stdout(PATH_MULTI_FIXTURE)
        self.assertEqual(result["hops"], 3)
        self.assertEqual(len(result["edges"]), 3)
        labels = result["subgraph"]["nodeLabels"]
        self.assertEqual(labels[0], "FastAPI")
        self.assertIn("ModelField", labels)


class GraphifyStorePersistTests(unittest.TestCase):
    def test_persist_and_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "workspace"
            out = src / "graphify-out"
            out.mkdir(parents=True)
            (out / "graph.json").write_text(
                '{"nodes":[{"id":"a","label":"A"}],"links":[]}',
                encoding="utf-8",
            )
            # Point store root at temp via monkeypatch of REPO_WORKSPACES_ROOT
            prev = gs.REPO_WORKSPACES_ROOT
            gs.REPO_WORKSPACES_ROOT = Path(tmp) / "workspaces"
            try:
                result = gs.persist_graphify_workspace("demo-project", src)
                self.assertTrue(result["ready"])
                self.assertEqual(result["nodeCount"], 1)
                status = gs.workspace_ready("demo-project")
                self.assertTrue(status["ready"])
                self.assertTrue((gs.graphify_out_path("demo-project") / "graph.json").is_file())
            finally:
                gs.REPO_WORKSPACES_ROOT = prev


class GraphifyBridgeKeepOutTests(unittest.TestCase):
    def test_keep_graphify_out_flag_signature(self) -> None:
        import inspect
        import graphify_bridge as bridge

        sig = inspect.signature(bridge.build_graphify_graph)
        self.assertIn("keep_graphify_out", sig.parameters)


if __name__ == "__main__":
    unittest.main()
