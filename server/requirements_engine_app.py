#!/usr/bin/env python3
"""
Standalone Requirements Engine API (FastAPI router from requirements_engine.py).

Start this on its own port (default 8790) and point Node's ingestion server /
Vite's dev proxy at it under /api/requirements. Mirrors agent_runs_app.py.
"""
from __future__ import annotations

import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from requirements_engine import create_requirements_engine_router


def load_repo_env_file() -> None:
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    env_path = os.path.join(root_dir, ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key:
                    existing = os.environ.get(key)
                    if existing is None or not str(existing).strip():
                        os.environ[key] = value
    except OSError as exc:
        print(f"⚠️  Warning: Failed to load .env file: {exc}")


load_repo_env_file()

app = FastAPI(title="NeoDevEx Requirements Engine API", version="1.0.0")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    return response


_origins_env = os.environ.get("REQUIREMENTS_API_ALLOWED_ORIGINS", "").strip()
_allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    max_age=86400,
)
app.include_router(create_requirements_engine_router(), prefix="/api/requirements")


@app.get("/api/requirements/health")
def health_requirements():
    has_key = bool(
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("VITE_GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    return {"status": "ok", "service": "requirements-engine", "geminiConfigured": has_key}


if __name__ == "__main__":
    port = int(os.environ.get("REQUIREMENTS_API_PORT", "8790"))
    uvicorn.run(app, host="0.0.0.0", port=port)
