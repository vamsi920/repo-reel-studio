#!/usr/bin/env python3
"""
Compare quick vs deep code-graph builders (no network).

Run from repo root (use the same Python/venv as the ingestion server):

  cd server && ../.venv/bin/python bench_graph.py
  # or:  npm run ingest:install && python3 bench_graph.py

Explains why Phase 1 felt slow: deep graph scans every file body + regex;
quick graph only regex-matches FILE headers on the bundle string.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import time
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent


def load_ingestion_module():
    os.chdir(SERVER_DIR)
    if str(SERVER_DIR) not in sys.path:
        sys.path.insert(0, str(SERVER_DIR))
    path = SERVER_DIR / "ingestion-server.py"
    spec = importlib.util.spec_from_file_location("_gitflick_ingestion_bench", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load ingestion-server.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    m = load_ingestion_module()

    small = (
        "----- FILE: src/a.ts -----\nexport const x = 1\n"
        "----- FILE: src/b.ts -----\nimport { x } from './a'\n"
    )

    huge = "".join(
        f"----- FILE: pkg/f{i:04d}.ts -----\nexport const v{i} = {i}\n" for i in range(400)
    )

    mega_line = (
        "----- FILE: dist/bundle.js -----\n"
        + "x" * 400_000
        + "\n----- FILE: ok.ts -----\nexport const z = 1\n"
    )

    cases = [
        ("tiny_2_files", small),
        ("synthetic_400_files", huge),
        ("one_400kb_line_plus_small", mega_line),
    ]

    print("GitFlick graph benchmark (local CPU only)\n")
    for name, blob in cases:
        t0 = time.perf_counter()
        q = m.build_code_graph_quick(blob)
        t_quick_ms = (time.perf_counter() - t0) * 1000

        t0 = time.perf_counter()
        d = m.build_code_graph(blob)
        t_deep_ms = (time.perf_counter() - t0) * 1000

        qn = len(q.get("nodes", [])) if q else 0
        dn = len(d.get("nodes", [])) if d else 0
        de = len(d.get("edges", [])) if d else 0
        print(f"{name}:")
        print(f"  quick: {t_quick_ms:8.2f} ms   nodes={qn}  (headers only)")
        print(f"  deep:  {t_deep_ms:8.2f} ms   nodes={dn}  edges={de}  (full scan)")
        print()


if __name__ == "__main__":
    main()
