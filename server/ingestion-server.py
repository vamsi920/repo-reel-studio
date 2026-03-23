#!/usr/bin/env python3
"""
Repository Ingestion Server using gitingest library + built-in graph analysis.
Provides API endpoints for cloning and processing GitHub repositories.
"""

import os
import re
import time
import json
import urllib.request
import urllib.error
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from agent_runs import create_agent_run_router

try:
    from gitingest import ingest
except ImportError:
    print("❌ Error: gitingest library not installed")
    print("Please run: pip install gitingest")
    exit(1)

import asyncio
from concurrent.futures import ThreadPoolExecutor

# Thread pool for running sync gitingest in async context.
# Each ingestion request occupies one worker for its full duration, so keep
# enough workers that a slow clone doesn't starve health-check/graph threads.
executor = ThreadPoolExecutor(max_workers=8)


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


# ---------------------------------------------------------------------------
# Built-in lightweight code graph builder
# Parses import / require / from statements from the gitingest content,
# builds file→file dependency edges, and clusters them by directory.
# Runs instantly — no subprocess, no npx, zero external dependencies.
# ---------------------------------------------------------------------------

# Regex patterns for import extraction (compiled once)
_JS_IMPORT_FROM = re.compile(r"""(?:import|export)\s+.*?from\s+['"]([\w@./\-]+)['"]""")
_JS_IMPORT_SIDE = re.compile(r"""^import\s+['"]([\w@./\-]+)['"]""")
_JS_REQUIRE = re.compile(r"""require\s*\(\s*['"]([\w@./\-]+)['"]\s*\)""")
_JS_DYNAMIC = re.compile(r"""import\s*\(\s*['"]([\w@./\-]+)['"]\s*\)""")
_PY_FROM_IMPORT = re.compile(r"""^from\s+([\w.]+)\s+import""")
_PY_IMPORT = re.compile(r"""^import\s+([\w.]+)""")

# Symbol extraction patterns
_JS_FUNC = re.compile(r"""^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)""")
_JS_CLASS = re.compile(r"""^(?:export\s+)?(?:default\s+)?class\s+(\w+)""")
_JS_ARROW = re.compile(r"""^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(""")
_JS_IFACE = re.compile(r"""^(?:export\s+)?interface\s+(\w+)""")
_JS_TYPE = re.compile(r"""^(?:export\s+)?type\s+(\w+)\s*=""")
_PY_DEF = re.compile(r"""^(?:async\s+)?def\s+(\w+)""")
_PY_CLASS = re.compile(r"""^class\s+(\w+)""")

_FILE_HEADER_RE = re.compile(r"^----- FILE: (.+?) -----$", re.MULTILINE)
_FILE_LINE_RE = re.compile(r"^\s*[Ff][Ii][Ll][Ee]:\s*(\S.*?)\s*$")
_DELIMITER_RE = re.compile(r"^\s*[=-]{3,}\s*$")
_TEST_DIR_RE = re.compile(r"(^|/)(__tests__|tests?|spec|e2e)(/|$)", re.I)
_TEST_NAME_RE = re.compile(r"(?:^|/)(?:test_.*|.*(?:_test|_spec)|.*\.(?:test|spec|e2e))\.[^./]+$", re.I)
_DOC_RE = re.compile(r"(^|/)(readme|docs?|contributing|changelog|license)(/|\.|$)", re.I)
_CONFIG_RE = re.compile(r"(^|/)(package(-lock)?\.json|pnpm-lock|yarn\.lock|bun\.lock|tsconfig|eslint|prettier|vite\.config|tailwind\.config|docker|render\.yaml|netlify|vercel|\.github)(/|\.|$)", re.I)

# Common extensions to try when resolving extensionless imports
_RESOLVE_EXTS = (
    "", ".ts", ".tsx", ".js", ".jsx", ".mjs",
    ".py", ".go", ".rs", ".vue", ".svelte",
    "/index.ts", "/index.tsx", "/index.js", "/index.jsx",
)

# Graph builder limits — large/minified repos used to hang for many minutes (O(files×edges)
# and regex on single-line bundles). Keep Phase 1 responsive.
_MAX_GRAPH_FILES = 180
_MAX_CHARS_FULL_SCAN_PER_FILE = 100_000
_MAX_LINE_LEN_FOR_SCAN = 6_000  # skip minified one-line files for import/symbol regex


def _parse_content_to_files(content: str) -> list[dict]:
    """
    Split gitingest bundled content into (filePath, fileContent) pairs.

    Uses a linear line parser instead of complex multiline regex because some
    gitingest bundle variants ("====\\nFILE: ...\\n====") can trigger very slow
    backtracking with permissive fallback patterns on large repos.
    """
    if not content:
        return []

    lines = content.splitlines(keepends=True)
    files: list[dict] = []

    i = 0
    n = len(lines)
    while i < n:
        match = _FILE_LINE_RE.match(lines[i].strip())
        if not match:
            i += 1
            continue

        file_path = match.group(1).strip()
        j = i + 1
        # Skip visual separator immediately after "FILE: path".
        if j < n and _DELIMITER_RE.match(lines[j].strip()):
            j += 1

        start = j
        while j < n and not _FILE_LINE_RE.match(lines[j].strip()):
            j += 1

        end = j
        # Trim trailing separator immediately before next header.
        while end > start and _DELIMITER_RE.match(lines[end - 1].strip()):
            end -= 1

        files.append(
            {
                "filePath": file_path,
                "content": "".join(lines[start:end]),
            }
        )
        i = j

    return files


def _resolve_import(spec: str, importer: str, known: set[str]) -> str | None:
    """Resolve a relative/alias import to one of the known files."""
    if not (spec.startswith(".") or spec.startswith("/") or spec.startswith("@/")):
        return None  # bare / node_modules import

    candidate = spec
    if candidate.startswith("@/"):
        candidate = candidate[2:]
    else:
        import_dir = os.path.dirname(importer)
        candidate = os.path.normpath(os.path.join(import_dir, candidate)).replace("\\", "/")

    for ext in _RESOLVE_EXTS:
        full = candidate + ext
        if full in known:
            return full
    return None


def _extract_imports(content: str, ext: str) -> list[str]:
    specs = []
    for line in content.split("\n"):
        if len(line) > _MAX_LINE_LEN_FOR_SCAN:
            continue
        t = line.strip()
        if t.startswith("//") or t.startswith("#") or t.startswith("*"):
            continue
        for pat in (_JS_IMPORT_FROM, _JS_IMPORT_SIDE, _JS_REQUIRE, _JS_DYNAMIC):
            m = pat.search(t)
            if m:
                specs.append(m.group(1))
                break
        else:
            if ext == ".py":
                m = _PY_FROM_IMPORT.match(t) or _PY_IMPORT.match(t)
                if m:
                    specs.append(m.group(1).replace(".", "/"))
    return specs


def _extract_symbols(content: str, ext: str) -> list[dict]:
    syms = []
    js_exts = {".js", ".jsx", ".ts", ".tsx", ".mjs"}
    for i, line in enumerate(content.split("\n"), 1):
        if len(line) > _MAX_LINE_LEN_FOR_SCAN:
            continue
        t = line.strip()
        if ext in js_exts:
            for pat, kind in [(_JS_FUNC, "Function"), (_JS_CLASS, "Class"),
                               (_JS_ARROW, "Function"), (_JS_IFACE, "Interface"),
                               (_JS_TYPE, "Interface")]:
                m = pat.match(t)
                if m:
                    syms.append({"name": m.group(1), "kind": kind, "line": i})
                    break
        elif ext == ".py":
            m = _PY_DEF.match(t)
            if m:
                syms.append({"name": m.group(1), "kind": "Function", "line": i})
                continue
            m = _PY_CLASS.match(t)
            if m:
                syms.append({"name": m.group(1), "kind": "Class", "line": i})
    return syms


def _is_test_file(file_path: str) -> bool:
    return bool(_TEST_DIR_RE.search(file_path) or _TEST_NAME_RE.search(file_path))


def _is_noise_file(file_path: str) -> bool:
    return _is_test_file(file_path) or bool(_DOC_RE.search(file_path) or _CONFIG_RE.search(file_path))


def build_code_graph(content: str) -> dict | None:
    """
    Build a code graph from gitingest bundled content.
    Returns { nodes, edges, clusters, processes } or None.

    Capped and optimized so medium repos (hundreds of files) finish in seconds,
    not minutes (avoids O(files × edges) and regex on minified single-line bundles).
    """
    files = _parse_content_to_files(content)
    if not files:
        return None

    total_files = len(files)
    # Deterministic cap: analyze at most _MAX_GRAPH_FILES paths (sorted by path).
    if total_files > _MAX_GRAPH_FILES:
        print(
            f"ℹ️  [Graph] Analyzing {_MAX_GRAPH_FILES}/{total_files} files (cap keeps Phase 1 fast)"
        )
        files = sorted(files, key=lambda f: f["filePath"])[:_MAX_GRAPH_FILES]

    known = {f["filePath"] for f in files}
    nodes = []
    edges = []

    for file in files:
        fp = file["filePath"]
        ext = os.path.splitext(fp)[1].lower()
        body = file["content"]
        line_count = body.count("\n") + 1

        # File node
        nodes.append({
            "id": fp,
            "name": os.path.basename(fp),
            "kind": "File",
            "filePath": fp,
            "startLine": 1,
            "endLine": line_count,
        })

        if len(body) > _MAX_CHARS_FULL_SCAN_PER_FILE:
            # Huge file: keep file node only (skip symbols/imports — minified bundles explode cost).
            continue

        # Symbol nodes
        for sym in _extract_symbols(body, ext):
            sym_id = f"{fp}::{sym['name']}"
            nodes.append({
                "id": sym_id,
                "name": sym["name"],
                "kind": sym["kind"],
                "filePath": fp,
                "startLine": sym["line"],
            })
            edges.append({"source": sym_id, "target": fp, "type": "DEFINED_IN"})

        # Import edges
        for spec in _extract_imports(body, ext):
            resolved = _resolve_import(spec, fp, known)
            if resolved and resolved != fp:
                edges.append({
                    "source": fp,
                    "target": resolved,
                    "type": "IMPORTS",
                    "confidence": 0.9,
                })

    # Cluster by top-level directory
    dir_groups: dict[str, list[str]] = {}
    for f in files:
        parts = f["filePath"].split("/")
        d = parts[0] if len(parts) > 1 else "(root)"
        dir_groups.setdefault(d, []).append(f["filePath"])

    clusters = [
        {"id": f"cluster_{i}", "label": d, "members": members}
        for i, (d, members) in enumerate(dir_groups.items())
        if members
    ]

    # Entry detection: O(edges) indices, not O(files × edges)
    imported_by: dict[str, set[str]] = {}
    sources_with_imports: set[str] = set()
    for e in edges:
        if e["type"] == "IMPORTS":
            imported_by.setdefault(e["target"], set()).add(e["source"])
            sources_with_imports.add(e["source"])

    def _entry_candidates() -> list[dict]:
        out = []
        for f in files:
            fp = f["filePath"]
            if fp not in sources_with_imports:
                continue
            if fp in imported_by:
                continue
            if _is_noise_file(fp):
                continue
            out.append(f)
        return out

    preferred_entries = _entry_candidates()[:5]
    entry_files = preferred_entries or [
        f for f in files
        if f["filePath"] in sources_with_imports and f["filePath"] not in imported_by
    ][:5]

    # BFS over imports using adjacency list (not O(depth × queue × |edges|))
    adj: dict[str, list[str]] = {}
    for e in edges:
        if e["type"] == "IMPORTS":
            adj.setdefault(e["source"], []).append(e["target"])

    processes = []
    for entry in entry_files:
        ep = entry["filePath"]
        steps = [ep]
        visited = {ep}
        queue = [ep]
        for _ in range(4):
            nxt = []
            for cur in queue:
                for tgt in adj.get(cur, []):
                    if tgt not in visited:
                        visited.add(tgt)
                        steps.append(tgt)
                        nxt.append(tgt)
            queue = nxt
            if not queue:
                break
        if len(steps) > 1:
            safe_name = re.sub(r"[^a-z0-9]+", "-", os.path.splitext(os.path.basename(ep))[0].lower()).strip("-")
            processes.append({
                "id": f"process-{len(processes) + 1}-{safe_name or 'flow'}",
                "name": f"Flow: {os.path.basename(ep)}",
                "steps": steps
            })

    return {"nodes": nodes, "edges": edges, "clusters": clusters, "processes": processes}


# Alternate header shapes some gitingest versions emit
def extract_file_paths_from_bundle(content: str) -> list[str]:
    """
    Collect paths from bundle headers only — no per-file body materialization.
    Linear scan keeps this step bounded even for very large repositories.
    """
    if not content:
        return []

    paths: list[str] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        m = _FILE_LINE_RE.match(line)
        if m:
            paths.append(m.group(1).strip())
    return paths


def build_code_graph_quick(content: str) -> dict | None:
    """
    Structure-only graph for Phase 1: file nodes + directory clusters, no imports/symbols.
    Scans the bundle with regex over headers only — typically a few ms even for large repos.
    """
    paths = extract_file_paths_from_bundle(content)
    if not paths:
        return None

    _MAX_QUICK_PATHS = 500
    if len(paths) > _MAX_QUICK_PATHS:
        paths = sorted(paths)[:_MAX_QUICK_PATHS]

    nodes: list[dict] = []
    for fp in paths:
        nodes.append(
            {
                "id": fp,
                "name": os.path.basename(fp),
                "kind": "File",
                "filePath": fp,
                "startLine": 1,
                "endLine": 1,
            }
        )

    dir_groups: dict[str, list[str]] = {}
    for fp in paths:
        parts = fp.split("/")
        d = parts[0] if len(parts) > 1 else "(root)"
        dir_groups.setdefault(d, []).append(fp)

    clusters = [
        {"id": f"cluster_{i}", "label": d, "members": members}
        for i, (d, members) in enumerate(dir_groups.items())
        if members
    ]

    return {
        "nodes": nodes,
        "edges": [],
        "clusters": clusters,
        "processes": [],
        "graphProfile": "quick",
    }


# FastAPI app setup
app = FastAPI(
    title="GitFlick Ingestion Server",
    description="Repository ingestion service powered by gitingest + GitNexus",
    version="3.0.0"
)
app.include_router(create_agent_run_router(), prefix="/api")

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
    projectId: Optional[str] = None


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


class EnsureRepoWorkspaceRequest(BaseModel):
    """One-time git clone per project for Studio + agent runs (mini-SWE sandbox source)."""

    repoUrl: str
    projectId: str
    branch: Optional[str] = None
    token: Optional[str] = None


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
    included = 0
    skipped = 0
    try:
        if "text files were processed" in summary or "files were processed" in summary:
            parts = summary.split("were processed")
            if parts:
                nums = [int(s) for s in parts[0].split() if s.isdigit()]
                if nums:
                    included = nums[-1]
        # Newer gitingest format:
        #   Repository: owner/name
        #   Commit: <sha>
        #   Files analyzed: 349
        if included == 0:
            analyzed_match = re.search(r"(?mi)^\s*files\s+analyzed:\s*(\d+)\s*$", summary)
            if analyzed_match:
                included = int(analyzed_match.group(1))
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


def count_files_in_content(content: str) -> int:
    """
    Count file entries in gitingest-style bundled content when summary has no stats.
    Gitingest uses "File: <path>" or "FILE: <path>" headers on their own line.
    """
    if not content or not content.strip():
        return 0
    count = 0
    for raw_line in content.splitlines():
        if _FILE_LINE_RE.match(raw_line.strip()):
            count += 1
    return count


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "repo-ingestion-server-v3",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "gitingest_available": True
    }


@app.post("/api/repo-workspace/ensure")
async def ensure_repo_workspace_endpoint(request: EnsureRepoWorkspaceRequest):
    """
    Clone the GitHub repo once into server/.repo-workspaces/<projectId>/workspace.
    Called after Phase 1 ingestion so Agent Runs can reuse this tree (no second clone).
    """
    from repo_workspace import ensure_cached_repo_workspace

    ENSURE_TIMEOUT_S = 6 * 60

    def _run() -> dict:
        return ensure_cached_repo_workspace(
            request.repoUrl.strip(),
            request.projectId.strip(),
            request.branch,
            request.token,
        )

    try:
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, _run),
            timeout=ENSURE_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail={
                "error": "Workspace setup timed out",
                "detail": f"Clone took longer than {ENSURE_TIMEOUT_S // 60} minutes.",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/repo-workspace/sync")
async def sync_repo_workspace_endpoint(request: EnsureRepoWorkspaceRequest):
    """
    Refresh the cached git workspace for a project to the latest remote commit.
    Used by the dashboard Sync action before a fresh planner/generation run.
    """
    from repo_workspace import sync_cached_repo_workspace

    SYNC_TIMEOUT_S = 6 * 60

    def _run() -> dict:
        return sync_cached_repo_workspace(
            request.repoUrl.strip(),
            request.projectId.strip(),
            request.branch,
            request.token,
        )

    try:
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, _run),
            timeout=SYNC_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail={
                "error": "Workspace sync timed out",
                "detail": f"Sync took longer than {SYNC_TIMEOUT_S // 60} minutes.",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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
async def ingest_repository(request: IngestRequest):
    """
    Ingest a GitHub repository using gitingest library.

    Runs gitingest + graph analysis in a background thread so the async event
    loop is never blocked.  A per-request hard timeout of 5 minutes is enforced
    server-side so a slow clone can never tie up the thread pool indefinitely.

    Returns:
        JSON with stats, content, and graphData (null if skipped/failed).
    """
    INGEST_TIMEOUT_S = 5 * 60  # 5 minutes — well inside the 8-min frontend guard
    start_time = time.time()
    repo_url = request.repoUrl.strip()

    request_id = f"{int(start_time * 1000) % 100000:05d}"
    print(f"\n📥 [{request_id}] Ingestion request received for: {repo_url}")

    if not repo_url:
        raise HTTPException(status_code=400, detail="repoUrl is required")

    if not (repo_url.startswith("http://") or repo_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="URL must use http or https protocol")

    print(f"✓ [{request_id}] URL validated")

    if request.token:
        os.environ["GITHUB_TOKEN"] = str(request.token)
        print(f"✓ [{request_id}] GitHub token provided for authentication")

    def _run_ingest() -> tuple[str, str, str]:
        """Runs gitingest synchronously inside a worker thread."""
        print(f"🔄 [{request_id}] Starting gitingest processing...")
        if request.token:
            os.environ["GITHUB_TOKEN"] = str(request.token)
        return ingest(repo_url)

    def _run_graph(content: str) -> dict | None:
        """Runs built-in graph builder inside a worker thread."""
        return build_code_graph(content)

    try:
        # ── Step 1: Text ingestion in thread with hard timeout ────────────
        try:
            summary, tree, content = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(executor, _run_ingest),
                timeout=INGEST_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=504,
                detail={
                    "error": "Ingestion timed out",
                    "detail": f"Cloning/ingesting took longer than {INGEST_TIMEOUT_S // 60} minutes. "
                              "Try a smaller or more public repository.",
                },
            )

        ingest_elapsed_ms = int((time.time() - start_time) * 1000)
        print(f"✓ [{request_id}] Gitingest processing complete ({ingest_elapsed_ms}ms)")

        included_files, skipped_files = parse_summary(summary)
        if included_files == 0 and content:
            fallback_count = count_files_in_content(content)
            if fallback_count > 0:
                included_files = fallback_count
                print(f"  (file count from content: {included_files})")

        total_bytes = len(content.encode("utf-8"))
        duration_ms = int((time.time() - start_time) * 1000)

        print(
            f"✓ [{request_id}] Ingestion complete: {included_files} files, "
            f"{format_bytes(total_bytes)}, {duration_ms / 1000:.2f}s"
        )

        # ── Step 2: Graph (default: quick header-only scan — ms, not minutes) ──
        graph_data = None
        deep_graph = os.environ.get("GITFLICK_DEEP_INGEST_GRAPH", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        t0 = time.time()
        if deep_graph:
            try:
                print(f"🔎 [{request_id}] Building deep graph...")
                graph_data = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(executor, _run_graph, content),
                    timeout=25,
                )
                graph_ms = int((time.time() - t0) * 1000)
                if graph_data:
                    nc = len(graph_data.get("nodes", []))
                    ec = len(graph_data.get("edges", []))
                    cc = len(graph_data.get("clusters", []))
                    print(
                        f"✅ [{request_id}] [Graph deep] "
                        f"{nc} nodes, {ec} edges, {cc} clusters ({graph_ms}ms)"
                    )
                else:
                    print(f"ℹ️  [{request_id}] [Graph deep] No graph data produced.")
            except (asyncio.TimeoutError, Exception) as graph_err:
                print(f"⚠️  [{request_id}] [Graph deep] Skipped (non-fatal): {graph_err}")
                graph_data = build_code_graph_quick(content)
                print(f"ℹ️  [{request_id}] [Graph] Fell back to quick graph after deep failure/timeout.")
        else:
            print(f"🔎 [{request_id}] Building quick graph from bundle headers...")
            graph_data = build_code_graph_quick(content)
            graph_ms = int((time.time() - t0) * 1000)
            if graph_data:
                nc = len(graph_data.get("nodes", []))
                cc = len(graph_data.get("clusters", []))
                print(
                    f"✅ [{request_id}] [Graph quick] "
                    f"{nc} file nodes, {cc} clusters ({graph_ms}ms)"
                )
            else:
                print(f"ℹ️  [{request_id}] [Graph quick] No file headers found in bundle.")

        response_data = {
            "repoUrl": repo_url,
            "stats": {
                "includedFiles": included_files,
                "skippedFiles": skipped_files,
                "totalBytes": total_bytes,
                "totalBytesFormatted": format_bytes(total_bytes),
                "durationMs": duration_ms,
            },
            "content": content,
            "graphData": graph_data,
        }

        return response_data
        
    except Exception as e:
        error_message = str(e)
        print(f"❌ Ingestion error: {error_message}")
        
        # Provide helpful error messages
        error_lower = error_message.lower()
        
        if ("could not resolve host" in error_lower or 
            "name or service not known" in error_lower or
            "getaddrinfo failed" in error_lower or
            "enotfound" in error_lower or
            "dns" in error_lower and "error" in error_lower):
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Network error - DNS resolution failed",
                    "detail": "Cannot resolve github.com. Check your internet connection and DNS settings."
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
                    "detail": "Cannot reach GitHub. Check your internet connection."
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
║  🚀 GitFlick Ingestion Server v3.0                          ║
║  Powered by gitingest + GitNexus                             ║
║  Running on http://localhost:{port}                        ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
