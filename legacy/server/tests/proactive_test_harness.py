from __future__ import annotations

import os
import shutil
import sys
import tempfile
import types
from pathlib import Path
from unittest import TestCase

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

REPO_URL = "https://github.com/example/proactive-core-tests.git"
PROJECT_ID = "core-tests"


def install_import_stubs() -> None:
    if "fastapi" in sys.modules:
        return

    fastapi = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: str = ""):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class APIRouter:
        def get(self, *args, **kwargs):
            def decorator(fn):
                return fn

            return decorator

        def post(self, *args, **kwargs):
            return self.get(*args, **kwargs)

    fastapi.HTTPException = HTTPException
    fastapi.APIRouter = APIRouter
    sys.modules["fastapi"] = fastapi

    pydantic = types.ModuleType("pydantic")

    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    class Field:
        def __init__(self, *args, **kwargs):
            pass

    pydantic.BaseModel = BaseModel
    pydantic.Field = Field
    sys.modules["pydantic"] = pydantic


class ProactiveTempStoreMixin(TestCase):
    def setUp(self) -> None:
        install_import_stubs()
        self._tmp_root = Path(tempfile.mkdtemp(prefix="proactive-core-test-"))
        self._prev_store_root = os.environ.get("PROACTIVE_STORE_ROOT")
        os.environ["PROACTIVE_STORE_ROOT"] = str(self._tmp_root)
        import proactive_store as store_module

        self.store = store_module

    def tearDown(self) -> None:
        if self._prev_store_root is None:
            os.environ.pop("PROACTIVE_STORE_ROOT", None)
        else:
            os.environ["PROACTIVE_STORE_ROOT"] = self._prev_store_root
        shutil.rmtree(self._tmp_root, ignore_errors=True)
