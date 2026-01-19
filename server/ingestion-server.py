#!/usr/bin/env python3
"""
Repository Ingestion Server using gitingest library
Provides API endpoints for cloning and processing GitHub repositories
"""

import os
import time
import json
import urllib.request
import urllib.error
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import uvicorn

try:
    from gitingest import ingest
except ImportError:
    print("❌ Error: gitingest library not installed")
    print("Please run: pip install gitingest")
    exit(1)

import asyncio
from concurrent.futures import ThreadPoolExecutor

# Thread pool for running sync gitingest in async context
executor = ThreadPoolExecutor(max_workers=4)


def load_env_file() -> None:
    """Load key/value pairs from the repo .env file if present."""
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
    except Exception as exc:
        print(f"⚠️  Warning: Failed to load .env file: {exc}")


load_env_file()


# FastAPI app setup
app = FastAPI(
    title="GitFlick Ingestion Server",
    description="Repository ingestion service powered by gitingest",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class IngestRequest(BaseModel):
    repoUrl: str
    branch: Optional[str] = None
    token: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    gitingest_available: bool


class IngestionStats(BaseModel):
    includedFiles: int
    skippedFiles: int
    totalBytes: int
    totalBytesFormatted: str
    durationMs: int


class IngestResponse(BaseModel):
    repoUrl: str
    stats: IngestionStats
    content: str


class TTSRequest(BaseModel):
    input: dict
    voice: dict
    audioConfig: dict
    apiKey: Optional[str] = None


def format_bytes(bytes_count: int) -> str:
    """Format bytes to human-readable string"""
    if bytes_count < 1024:
        return f"{bytes_count} B"
    kb = bytes_count / 1024
    if kb < 1024:
        return f"{kb:.1f} KB"
    return f"{(kb / 1024):.1f} MB"


def parse_summary(summary: str) -> tuple[int, int]:
    """
    Parse the summary string from gitingest to extract file counts
    Returns: (included_files, skipped_files)
    """
    # Summary format example:
    # "This repository contains 145 files. 123 text files were processed, 22 were skipped."
    
    included = 0
    skipped = 0
    
    try:
        # Look for patterns like "123 text files were processed"
        if "text files were processed" in summary or "files were processed" in summary:
            parts = summary.split("were processed")
            if parts:
                nums = [int(s) for s in parts[0].split() if s.isdigit()]
                if nums:
                    included = nums[-1]
        
        # Look for patterns like "22 were skipped"
        if "were skipped" in summary or "was skipped" in summary:
            parts = summary.split("were skipped")
            if not parts or len(parts) < 2:
                parts = summary.split("was skipped")
            if parts:
                nums = [int(s) for s in parts[0].split() if s.isdigit()]
                if nums:
                    skipped = nums[-1]
    except Exception as e:
        print(f"⚠️  Warning: Could not parse summary: {e}")
    
    return included, skipped


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "repo-ingestion-server-v2",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "gitingest_available": True
    }


@app.post("/api/tts")
def synthesize_tts(request: TTSRequest):
    """Proxy Google TTS requests to avoid browser CORS issues."""
    api_key = (
        os.getenv("GOOGLE_TTS_API_KEY")
        or os.getenv("VITE_GOOGLE_TTS_API_KEY")
        or request.apiKey
    )

    if not api_key:
        raise HTTPException(status_code=400, detail="Google TTS API key not configured")

    if not isinstance(request.input, dict) or not request.input.get("text"):
        raise HTTPException(status_code=400, detail="Missing input.text in request body")

    payload = {
        "input": request.input,
        "voice": request.voice,
        "audioConfig": request.audioConfig,
    }

    url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}

    try:
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise HTTPException(
            status_code=exc.code,
            detail=f"Google TTS API error: {exc.code} - {detail}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS proxy error: {exc}")


@app.post("/api/ingest")
def ingest_repository(request: IngestRequest):
    """
    Ingest a GitHub repository using gitingest library
    
    Args:
        request: IngestRequest with repoUrl, optional branch and token
        
    Returns:
        IngestResponse with stats and content
    """
    start_time = time.time()
    repo_url = request.repoUrl.strip()
    
    print(f"\n📥 Ingestion request received for: {repo_url}")
    
    # Validate URL
    if not repo_url:
        raise HTTPException(
            status_code=400,
            detail="repoUrl is required"
        )
    
    # Basic URL validation
    if not (repo_url.startswith("http://") or repo_url.startswith("https://")):
        raise HTTPException(
            status_code=400,
            detail="URL must use http or https protocol"
        )
    
    print(f"✓ URL validated: {repo_url}")
    
    # Prepare environment for token if provided
    if request.token:
        os.environ["GITHUB_TOKEN"] = request.token
        print("✓ GitHub token provided for authentication")
    
    try:
        # Use gitingest to process the repository
        print("🔄 Starting gitingest processing...")
        
        # Call gitingest (it handles cloning, filtering, and bundling)
        # Pass token via environment if provided
        if request.token:
            os.environ["GITHUB_TOKEN"] = request.token
        
        summary, tree, content = ingest(repo_url)
        
        print(f"✓ Gitingest processing complete")
        
        # Calculate statistics
        included_files, skipped_files = parse_summary(summary)
        
        # Calculate total bytes from content
        total_bytes = len(content.encode('utf-8'))
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Log statistics
        print(f"✓ Ingestion complete:")
        print(f"  - Files included: {included_files}")
        print(f"  - Files skipped: {skipped_files}")
        print(f"  - Total size: {format_bytes(total_bytes)}")
        print(f"  - Duration: {duration_ms / 1000:.2f}s\n")
        
        response_data = {
            "repoUrl": repo_url,
            "stats": {
                "includedFiles": included_files,
                "skippedFiles": skipped_files,
                "totalBytes": total_bytes,
                "totalBytesFormatted": format_bytes(total_bytes),
                "durationMs": duration_ms
            },
            "content": content
        }
        
        return response_data
        
    except Exception as e:
        error_message = str(e)
        print(f"❌ Ingestion error: {error_message}")
        
        # Provide helpful error messages
        error_lower = error_message.lower()
        
        # DNS/Network resolution errors
        if ("could not resolve host" in error_lower or 
            "name or service not known" in error_lower or
            "getaddrinfo failed" in error_lower or
            "enotfound" in error_lower or
            "dns" in error_lower and "error" in error_lower):
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Network error - DNS resolution failed",
                    "detail": "Cannot resolve github.com. Check your internet connection and DNS settings. If you're behind a firewall or VPN, ensure GitHub is accessible."
                }
            )
        elif "not found" in error_lower or "404" in error_message:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Repository not found",
                    "detail": "The repository doesn't exist or is private. Check the URL and access permissions."
                }
            )
        elif "authentication" in error_lower or "401" in error_message or "403" in error_message:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Authentication required",
                    "detail": "This repository is private. Please provide a GitHub token."
                }
            )
        elif "timeout" in error_lower or "timed out" in error_lower:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Connection timeout",
                    "detail": "The repository took too long to process. Try again or check your network connection."
                }
            )
        elif ("connection" in error_lower or 
              "network" in error_lower or
              "unable to access" in error_lower or
              "failed to connect" in error_lower):
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Network error",
                    "detail": "Cannot reach GitHub. Check your internet connection and ensure GitHub is accessible."
                }
            )
        else:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Ingestion failed",
                    "detail": error_message
                }
            )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8787))
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  🚀 GitFlick Ingestion Server v2.0                          ║
║  Powered by gitingest library                                ║
║  Running on http://localhost:{port}                        ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
