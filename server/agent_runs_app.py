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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_runs import create_agent_run_router


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
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError as exc:
        print(f"⚠️  Warning: Failed to load .env file: {exc}")


load_repo_env_file()

app = FastAPI(title="GitFlick Agent Runs API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(create_agent_run_router(), prefix="/api")


@app.get("/api/health-agent")
def health_agent():
    return {"status": "ok", "service": "agent-runs-api"}


if __name__ == "__main__":
    port = int(os.environ.get("AGENT_API_PORT", "8788"))
    uvicorn.run(app, host="0.0.0.0", port=port)
