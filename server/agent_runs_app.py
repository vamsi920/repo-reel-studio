#!/usr/bin/env python3
"""
Standalone Agent Ops API (FastAPI router from agent_runs.py).

Used when ingestion runs on Node (npm run ingest:server). Start this on a
different port (default 8788) and point AGENT_RUNS_PROXY_URL there from Node.

Full Python ingestion (./server/start-server.sh) already includes these routes.
"""
from __future__ import annotations

import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from agent_runs import create_agent_run_router
from github_webhook import create_webhook_router
from governance_api import create_governance_router
from proactive_api import create_proactive_router
from proactive_api_errors import register_proactive_exception_handlers


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
                    # Allow .env to hydrate missing OR empty variables.
                    # This avoids cases where an empty parent-shell var blocks the real key.
                    if existing is None or not str(existing).strip():
                        os.environ[key] = value
    except OSError as exc:
        print(f"⚠️  Warning: Failed to load .env file: {exc}")


load_repo_env_file()

app = FastAPI(title="GitFlick Agent Runs API", version="1.0.0")
register_proactive_exception_handlers(app)


# Security headers on every API response (defense-in-depth for the agent-ops API).
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


# CORS: tightened to a configurable allowlist. No credentials are used (the app is
# auth-free / token-in-body), so we keep credentials off and default to a permissive
# origin only when no allowlist is configured.
_origins_env = os.environ.get("AGENT_API_ALLOWED_ORIGINS", "").strip()
_allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    max_age=86400,
)
app.include_router(create_agent_run_router(), prefix="/api")
app.include_router(create_webhook_router(), prefix="/api")
app.include_router(create_proactive_router(), prefix="/api")
app.include_router(create_governance_router(), prefix="/api")


@app.get("/api/health-agent")
def health_agent():
    from agent_ops_health import build_agent_api_health

    return build_agent_api_health()


if __name__ == "__main__":
    port = int(os.environ.get("AGENT_API_PORT", "8788"))
    uvicorn.run(app, host="0.0.0.0", port=port)
