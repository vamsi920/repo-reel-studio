#!/usr/bin/env python3
"""Run focused proactive unittest suite (pass 24/40)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def main() -> int:
    suite = unittest.defaultTestLoader.discover(
        str(SERVER_DIR / "tests"),
        pattern="test_proactive_*.py",
        top_level_dir=str(SERVER_DIR),
    )
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    if result.wasSuccessful():
        print("OK: proactive core unittest suite")
        return 0
    print("FAIL: proactive core unittest suite", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
