"""
Project-level stack & environment override API.

Lets a project set its own install/build/test commands and base image,
taking precedence over env_builder.py's auto-detection — the escape hatch
for stacks the sandbox doesn't recognize out of the box. Deliberately keyed
by project_id only (no org/tenant column yet — that lands with multi-tenancy
later; this table just needs an added column then, not a reshape).

Mounted under /api. See env_builder.detect_stack()'s `overrides` param for
how this is applied.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import supabase_store

TABLE = "project_env_overrides"


class EnvOverrideInput(BaseModel):
    install_command: Optional[str] = None
    build_commands: Optional[list[str]] = None
    test_commands: Optional[list[str]] = None
    base_image: Optional[str] = None


def _row_to_response(project_id: str, row: Optional[dict[str, Any]]) -> dict[str, Any]:
    row = row or {}
    return {
        "project_id": project_id,
        "install_command": row.get("install_command"),
        "build_commands": row.get("build_commands") or [],
        "test_commands": row.get("test_commands") or [],
        "base_image": row.get("base_image"),
        "updated_at": row.get("updated_at"),
    }


def _load_detected_stack(project_id: str) -> Optional[dict[str, Any]]:
    from env_builder import load_env_artifacts

    artifacts = load_env_artifacts(project_id)
    return artifacts["detect"] if artifacts else None


def create_env_settings_router() -> APIRouter:
    router = APIRouter()

    @router.get("/env-settings/{project_id}")
    def get_env_settings(project_id: str) -> dict[str, Any]:
        override = (
            _row_to_response(project_id, supabase_store.select_one(TABLE, {"project_id": project_id}))
            if supabase_store.is_configured()
            else _row_to_response(project_id, None)
        )
        return {**override, "detected": _load_detected_stack(project_id)}

    @router.put("/env-settings/{project_id}")
    def put_env_settings(project_id: str, payload: EnvOverrideInput) -> dict[str, Any]:
        if not supabase_store.is_configured():
            raise HTTPException(status_code=503, detail="Supabase is not configured on this server")

        row = {
            "project_id": project_id,
            "install_command": payload.install_command,
            "build_commands": payload.build_commands or [],
            "test_commands": payload.test_commands or [],
            "base_image": payload.base_image,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        saved = supabase_store.upsert(TABLE, row, on_conflict="project_id")
        return {**_row_to_response(project_id, saved or row), "detected": _load_detected_stack(project_id)}

    return router
