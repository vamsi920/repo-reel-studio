#!/usr/bin/env python3
"""FastAPI route tests for proactive_api (pass 25/40)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def main() -> int:
    try:
        import fastapi  # noqa: F401
    except ImportError:
        print("SKIP: proactive API route tests (install server/requirements.txt for FastAPI)")
        return 0

    suite = unittest.defaultTestLoader.loadTestsFromName("tests.test_proactive_api")
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    if result.wasSuccessful():
        print("OK: proactive API FastAPI routes")
        return 0
    print("FAIL: proactive API FastAPI routes", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
