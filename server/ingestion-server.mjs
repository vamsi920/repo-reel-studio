import express from "express";
import cors from "cors";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { x as tarExtract } from "tar";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { buildCodeGraph } from './code-graph-rag.mjs';


const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CODEGRAPH_BRIDGE_PATH = path.join(__dirname, "codegraph_bridge.py");


const app = express();
const DEFAULT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;  // 25 MB – more code, skip config/lock/docs
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;         // 512 KB
const DEFAULT_MAX_FILES = 400;
const DEFAULT_CLONE_TIMEOUT_MS = Number(process.env.INGEST_CLONE_TIMEOUT_MS || 90_000);
const DEFAULT_ARCHIVE_FETCH_TIMEOUT_MS = Number(process.env.INGEST_ARCHIVE_FETCH_TIMEOUT_MS || 20_000);
const DEFAULT_ARCHIVE_EXTRACT_TIMEOUT_MS = Number(process.env.INGEST_ARCHIVE_EXTRACT_TIMEOUT_MS || 30_000);
const DEFAULT_TTS_TIMEOUT_MS = Number(process.env.TTS_PROXY_TIMEOUT_MS || 30_000);
const DEFAULT_GITHUB_API_TIMEOUT_MS = Number(process.env.INGEST_GITHUB_API_TIMEOUT_MS || 12_000);
const DEFAULT_GITHUB_INGEST_TIMEOUT_MS = Number(process.env.INGEST_GITHUB_INGEST_TIMEOUT_MS || 90_000);
const DEFAULT_GITHUB_BLOB_BATCH_SIZE = Number(process.env.INGEST_GITHUB_BLOB_BATCH_SIZE || 12);
const DEFAULT_PYTHON_CODEGRAPH_TIMEOUT_MS = Number(process.env.INGEST_PYTHON_CODEGRAPH_TIMEOUT_MS || 45_000);
const GITHUB_API_BASE = "https://api.github.com";
const MAX_DIAGNOSTIC_SAMPLES = 5;

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// CORS configuration - allow specific origins (dev + production)
const BASE_ORIGINS = [
  'https://gitflick.netlify.app',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
];
// Optional: CORS_ORIGINS env (comma-separated) for Render/deploy
const EXTRA = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const allowedOrigins = [...BASE_ORIGINS, ...EXTRA];

// Helper function to get allowed origin from request
const getAllowedOrigin = (req) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  // Allow requests with no origin (like mobile apps, Postman, curl)
  if (!origin) {
    return '*';
  }
  return null; // Disallowed origin
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['POST', 'OPTIONS', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS explicitly (backup if cors doesn't; avoid double-send)
app.options('*', (req, res) => {
  if (res.headersSent) return;
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  res.status(origin && allowedOrigins.includes(origin) ? 204 : 403).end();
});

app.use(express.json({ limit: "1mb" }));

// Global error handler — must set CORS or browser reports "No Access-Control-Allow-Origin"
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      detail: err.message || 'Unknown error',
    });
  }
});

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "repo-ingestion-server",
    version: "2.0.0",
    endpoints: {
      health: "/api/health",
      ingest: "/api/ingest",
      ingestFolder: "/api/ingest-folder",
      tts: "/api/tts",
    },
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint - must respond quickly
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "repo-ingestion-server",
    ingestionMode: "fast-node",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/tts", async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.VITE_GOOGLE_TTS_API_KEY || req.body?.apiKey;
    if (!apiKey) {
      return res.status(400).json({ error: "Google TTS API key not configured" });
    }

    const { input, voice, audioConfig } = req.body ?? {};
    if (!input || typeof input !== "object" || !input.text) {
      return res.status(400).json({ error: "Missing input.text in request body" });
    }
    if (!voice || typeof voice !== "object") {
      return res.status(400).json({ error: "Missing voice in request body" });
    }
    if (!audioConfig || typeof audioConfig !== "object") {
      return res.status(400).json({ error: "Missing audioConfig in request body" });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TTS_TIMEOUT_MS);
    let ttsResponse;
    try {
      ttsResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, voice, audioConfig }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const raw = await ttsResponse.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { error: raw || "Unknown TTS response" };
    }

    if (!ttsResponse.ok) {
      return res.status(ttsResponse.status).json({
        error: `Google TTS API error: ${ttsResponse.status}`,
        detail: payload,
      });
    }

    return res.json(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return res.status(504).json({ error: "TTS proxy timeout" });
    }
    return res.status(500).json({
      error: "TTS proxy error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
  ".output",
  "out",
  "venv",
  ".venv",
  "__pycache__",
  "vendor",
  "third_party",
  "target",
  "tmp",
  ".idea",
  ".vscode",
  ".github",
]);

// Exclude config, lockfiles, and docs so quota is used for source code only
const NON_CODE_PATH_RE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lock|\.npmrc|\.yarnrc|tsconfig\.json|jsconfig\.json|tsconfig[^/]*\.json|eslint\.config\.?\w*|\.eslintrc|\.prettierrc|prettier\.config\.\w*|vite\.config\.\w*|tailwind\.config\.\w*|postcss\.config\.\w*|rollup\.config\.\w*|webpack\.config\.\w*|Dockerfile|\.dockerignore|docker-compose\.\w*|render\.yaml|netlify\.toml|vercel\.json|\.env\.example|\.env\.sample|README\.md|CHANGELOG|LICENSE|CONTRIBUTING\.md|\.editorconfig)(\/|$)/i;
const isNonCodePath = (relPath) => NON_CODE_PATH_RE.test(relPath.replace(/\\/g, "/"));

const ALLOWED_EXTS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".mdx",
  ".txt",
  ".sh",
  ".bash",
  ".sql",
  ".graphql",
  ".gql",
]);

const githubApiHeaders = (token, accept = "application/vnd.github+json") => {
  const headers = {
    Accept: accept,
    "User-Agent": "GitFlick-Ingest/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const isIgnoredRelativePath = (relPath) => {
  const parts = relPath.split("/").filter(Boolean);
  return parts.some((segment) => IGNORE_DIRS.has(segment));
};

const shouldIncludeAsCode = (relPath) => !isNonCodePath(relPath);

const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const pushDiagnosticSample = (samples, value) => {
  if (!value || samples.length >= MAX_DIAGNOSTIC_SAMPLES || samples.includes(value)) return;
  samples.push(value);
};

const createHttpError = ({ message, detail, status = 500, code = "internal_error", meta = null }) => {
  const error = new Error(detail || message);
  error.publicMessage = message;
  error.publicDetail = detail || message;
  error.statusCode = status;
  error.errorCode = code;
  if (meta) {
    error.meta = meta;
  }
  return error;
};

const createRepoScanDiagnostics = () => ({
  scannedFiles: 0,
  ignoredDirectories: 0,
  skippedByReason: {
    unsupportedExtension: 0,
    nonCode: 0,
    fileTooLarge: 0,
    limitReached: 0,
  },
  samples: {
    unsupportedExtension: [],
    nonCode: [],
    fileTooLarge: [],
    ignoredDirectories: [],
  },
});

const recordRepoScanSkip = (diagnostics, reason, relPath) => {
  if (!diagnostics?.skippedByReason?.[reason] && diagnostics?.skippedByReason?.[reason] !== 0) return;
  diagnostics.skippedByReason[reason] += 1;
  if (relPath && diagnostics.samples?.[reason]) {
    pushDiagnosticSample(diagnostics.samples[reason], relPath);
  }
};

const joinSamples = (values) => values.map((value) => `"${value}"`).join(", ");

const buildNoEligibleSourceFilesDetail = (diagnostics = {}, branch = null) => {
  const scannedFiles = diagnostics.scannedFiles || 0;
  const skippedByReason = diagnostics.skippedByReason || {};
  const samples = diagnostics.samples || {};
  const summary = [];

  if (skippedByReason.nonCode) {
    summary.push(`${pluralize(skippedByReason.nonCode, "documentation/config file")}`);
  }
  if (skippedByReason.unsupportedExtension) {
    summary.push(`${pluralize(skippedByReason.unsupportedExtension, "unsupported file")}`);
  }
  if (skippedByReason.fileTooLarge) {
    summary.push(`${pluralize(skippedByReason.fileTooLarge, "oversized file")}`);
  }
  if (diagnostics.ignoredDirectories) {
    summary.push(`${pluralize(diagnostics.ignoredDirectories, "ignored directory", "ignored directories")}`);
  }
  if (skippedByReason.limitReached) {
    summary.push(`${pluralize(skippedByReason.limitReached, "file blocked by ingest limits")}`);
  }

  const parts = [
    branch
      ? `The repository downloaded successfully from branch "${branch}", but no eligible source files were found.`
      : "The repository downloaded successfully, but no eligible source files were found.",
    scannedFiles > 0
      ? `Scanned ${pluralize(scannedFiles, "file")} outside ignored directories.`
      : "No readable files were present outside ignored directories.",
  ];

  if (summary.length > 0) {
    parts.push(`What was found instead: ${summary.join(", ")}.`);
  }

  if (samples.nonCode?.length) {
    parts.push(`Docs/config examples: ${joinSamples(samples.nonCode)}.`);
  }
  if (samples.unsupportedExtension?.length) {
    parts.push(`Unsupported examples: ${joinSamples(samples.unsupportedExtension)}.`);
  }
  if (samples.fileTooLarge?.length) {
    parts.push(`Oversized examples: ${joinSamples(samples.fileTooLarge)}.`);
  }
  if (samples.ignoredDirectories?.length) {
    parts.push(`Ignored directories: ${joinSamples(samples.ignoredDirectories)}.`);
  }

  parts.push("This usually means the URL points to a placeholder repo, a docs-only repo, or the wrong repository. Try the repo that contains the actual source code, or upload the source folder directly.");
  return parts.join(" ");
};

const isLikelyBinary = (buf) => {
  if (!buf || buf.length === 0) return false;
  const sampleLen = Math.min(buf.length, 4096);
  let suspicious = 0;
  for (let i = 0; i < sampleLen; i += 1) {
    const byte = buf[i];
    if (byte === 0) return true;
    const isPrintable = byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126);
    if (!isPrintable) suspicious += 1;
  }
  return suspicious / sampleLen > 0.3;
};

async function fetchJsonWithTimeout(url, { token, accept, timeoutMs = DEFAULT_GITHUB_API_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: githubApiHeaders(token, accept),
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : text?.slice(0, 240) || "Unknown GitHub API error";
      throw new Error(`GitHub API ${response.status}: ${message}`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`GitHub API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ingestFromGitHubApi({
  owner,
  repo,
  requestedBranch,
  token,
  maxFiles,
  maxBytes,
  maxFileBytes,
}) {
  return withTimeout(async () => {
    let defaultBranch = null;
    try {
      const repoMeta = await fetchJsonWithTimeout(
        `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { token }
      );
      if (typeof repoMeta?.default_branch === "string" && repoMeta.default_branch.trim()) {
        defaultBranch = repoMeta.default_branch.trim();
      }
    } catch (metaErr) {
      console.warn(`⚠️  GitHub repo metadata lookup failed: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
    }

    const branchCandidates = [
      requestedBranch,
      defaultBranch,
      "main",
      "master",
    ].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

    let tree = null;
    let resolvedBranch = null;
    let lastTreeError = null;
    for (const branch of branchCandidates) {
      try {
        const treePayload = await fetchJsonWithTimeout(
          `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
          { token }
        );
        if (Array.isArray(treePayload?.tree)) {
          tree = treePayload.tree;
          resolvedBranch = branch;
          break;
        }
        throw new Error("Tree payload missing 'tree' array");
      } catch (treeErr) {
        lastTreeError = treeErr;
        console.warn(`GitHub tree fetch failed (${branch}): ${treeErr instanceof Error ? treeErr.message : String(treeErr)}`);
      }
    }

    if (!tree || !resolvedBranch) {
      throw lastTreeError || new Error("Could not fetch repository tree via GitHub API");
    }

    const candidates = [];
    let skippedFiles = 0;
    for (const entry of tree) {
      if (!entry || entry.type !== "blob") continue;
      if (typeof entry.path !== "string" || typeof entry.sha !== "string") continue;
      const relPath = entry.path.replace(/^\/+/, "");
      if (!relPath) continue;
      if (isIgnoredRelativePath(relPath)) continue;
      if (!shouldIncludeAsCode(relPath)) {
        skippedFiles += 1;
        continue;
      }
      const ext = path.extname(relPath).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) continue;

      const size = typeof entry.size === "number" ? entry.size : 0;
      if (size > maxFileBytes) {
        skippedFiles += 1;
        continue;
      }
      candidates.push({ path: relPath, sha: entry.sha, size });
    }

    const codeExtOrder = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".vue", ".svelte", ".php", ".rb", ".c", ".cpp", ".h", ".hpp"];
    const codePriority = (p) => {
      const ext = path.extname(p).toLowerCase();
      const i = codeExtOrder.indexOf(ext);
      return i >= 0 ? i : codeExtOrder.length;
    };
    candidates.sort((a, b) => codePriority(a.path) - codePriority(b.path) || a.size - b.size || a.path.localeCompare(b.path));

    const fetchLimit = Math.max(maxFiles * 6, maxFiles + 40);
    const limitedCandidates = candidates.slice(0, fetchLimit);

    const chunks = [];
    let includedFiles = 0;
    let totalBytes = 0;

    const fetchBlob = async (entry) => {
      const blobPayload = await fetchJsonWithTimeout(
        `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(entry.sha)}`,
        { token }
      );

      if (blobPayload?.truncated) {
        return { skipped: true };
      }
      if (blobPayload?.encoding !== "base64" || typeof blobPayload?.content !== "string") {
        return { skipped: true };
      }

      let raw;
      try {
        raw = Buffer.from(blobPayload.content.replace(/\n/g, ""), "base64");
      } catch {
        return { skipped: true };
      }
      if (raw.length === 0 || raw.length > maxFileBytes || isLikelyBinary(raw)) {
        return { skipped: true };
      }

      const content = raw.toString("utf8");
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > maxFileBytes) {
        return { skipped: true };
      }

      return {
        skipped: false,
        path: entry.path,
        content,
        bytes,
      };
    };

    const batchSize = Math.max(1, DEFAULT_GITHUB_BLOB_BATCH_SIZE);
    for (let i = 0; i < limitedCandidates.length; i += batchSize) {
      if (includedFiles >= maxFiles || totalBytes >= maxBytes) break;
      const batch = limitedCandidates.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (entry) => {
          try {
            return await fetchBlob(entry);
          } catch {
            return { skipped: true };
          }
        })
      );

      for (const result of results) {
        if (result.skipped) {
          skippedFiles += 1;
          continue;
        }
        if (includedFiles >= maxFiles || totalBytes + result.bytes > maxBytes) {
          skippedFiles += 1;
          continue;
        }
        chunks.push(`\n\n----- FILE: ${result.path} -----\n${result.content}`);
        totalBytes += result.bytes;
        includedFiles += 1;
      }
    }

    if (includedFiles === 0) {
      throw new Error("No eligible source files found via GitHub API");
    }

    return {
      chunks,
      includedFiles,
      skippedFiles,
      totalBytes,
      branch: resolvedBranch,
      mode: "github-api",
    };
  }, DEFAULT_GITHUB_INGEST_TIMEOUT_MS, `GitHub API ingest timeout after ${DEFAULT_GITHUB_INGEST_TIMEOUT_MS}ms`);
}

const readTextFile = async (filePath, maxFileBytes) => {
  const stat = await fs.promises.stat(filePath);
  if (stat.size > maxFileBytes) {
    return { skipped: true, reason: "file_too_large", bytes: stat.size };
  }
  const content = await fs.promises.readFile(filePath, "utf8");
  return { skipped: false, content, bytes: Buffer.byteLength(content, "utf8") };
};

/**
 * Walk and read in one pass; stop as soon as we hit maxFiles or maxBytes.
 * Keeps memory and CPU low on Render—never materializes a full file list.
 */
async function walkAndRead(rootDir, opts) {
  const maxFiles = opts.maxFiles || DEFAULT_MAX_FILES;
  const maxBytes = opts.maxBytes || opts.maxTotalBytes || DEFAULT_MAX_TOTAL_BYTES;
  const maxFileBytes = opts.maxFileBytes || DEFAULT_MAX_FILE_BYTES;
  const diagnostics = createRepoScanDiagnostics();
  const state = { chunks: [], totalBytes: 0, includedFiles: 0, skippedFiles: 0, stop: false, diagnostics };

  const visit = async (currentDir) => {
    if (state.stop) return;
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    const fileEntries = [];
    const dirEntries = [];
    for (const e of entries) {
      if (e.isFile()) fileEntries.push(e);
      else if (e.isDirectory()) dirEntries.push(e);
    }

    for (const e of fileEntries) {
      if (state.stop) return;
      const full = path.join(currentDir, e.name);
      const relPath = path.relative(rootDir, full).replace(/\\/g, "/");
      state.diagnostics.scannedFiles += 1;
      if (!ALLOWED_EXTS.has(path.extname(e.name).toLowerCase())) {
        state.skippedFiles++;
        recordRepoScanSkip(state.diagnostics, "unsupportedExtension", relPath);
        continue;
      }
      if (!shouldIncludeAsCode(relPath)) {
        state.skippedFiles++;
        recordRepoScanSkip(state.diagnostics, "nonCode", relPath);
        continue;
      }
      const result = await readTextFile(full, maxFileBytes);
      if (result.skipped) {
        state.skippedFiles++;
        recordRepoScanSkip(state.diagnostics, "fileTooLarge", relPath);
        continue;
      }
      if (state.totalBytes + result.bytes > maxBytes || state.includedFiles >= maxFiles) {
        state.skippedFiles++;
        recordRepoScanSkip(state.diagnostics, "limitReached", relPath);
        state.stop = true;
        return;
      }
      state.chunks.push(`\n\n----- FILE: ${relPath} -----\n${result.content}`);
      state.totalBytes += result.bytes;
      state.includedFiles++;
    }

    for (const e of dirEntries) {
      if (state.stop) return;
      if (IGNORE_DIRS.has(e.name)) {
        state.diagnostics.ignoredDirectories += 1;
        const relPath = path.relative(rootDir, path.join(currentDir, e.name)).replace(/\\/g, "/");
        pushDiagnosticSample(state.diagnostics.samples.ignoredDirectories, relPath || e.name);
        continue;
      }
      await visit(path.join(currentDir, e.name));
    }
  };

  await visit(rootDir);
  return {
    chunks: state.chunks,
    includedFiles: state.includedFiles,
    skippedFiles: state.skippedFiles,
    totalBytes: state.totalBytes,
    diagnostics: state.diagnostics,
  };
}

const withTimeout = async (promiseFactory, timeoutMs, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

/** Fetch GitHub archive (tar.gz) and stream-extract to dir. Tar auto-detects gzip. No git, minimal memory. */
async function fetchGitHubArchive(owner, repo, branch, destDir) {
  const url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/archive/refs/heads/${encodeURIComponent(branch)}.tar.gz`;
  const controller = new AbortController();
  const fetchTimeoutId = setTimeout(() => controller.abort(), DEFAULT_ARCHIVE_FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "GitFlick-Ingest/1.0" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Archive fetch timeout after ${DEFAULT_ARCHIVE_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(fetchTimeoutId);
  }
  if (!res.ok) throw new Error(`Archive ${res.status}`);
  if (!res.body) throw new Error("Archive body missing");
  await fs.promises.mkdir(destDir, { recursive: true });
  const src = Readable.fromWeb(res.body);
  const extract = tarExtract({ cwd: destDir, strip: 1 });
  src.pipe(extract);
  await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      const timeoutErr = new Error(`Archive extract timeout after ${DEFAULT_ARCHIVE_EXTRACT_TIMEOUT_MS}ms`);
      src.destroy(timeoutErr);
      extract.destroy(timeoutErr);
      reject(timeoutErr);
    }, DEFAULT_ARCHIVE_EXTRACT_TIMEOUT_MS);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    };

    extract.on("close", finish);
    extract.on("error", fail);
  });
}

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const parseChunksToFiles = (chunks) => {
  const files = [];
  for (const chunk of chunks || []) {
    const match = chunk.match(/^[\s\S]*?----- FILE: (.+?) -----\n([\s\S]*)$/);
    if (!match) continue;
    files.push({
      filePath: match[1].replace(/\\/g, "/"),
      content: match[2],
    });
  }
  return files;
};

const sanitizeRelativePath = (value) =>
  path.posix
    .normalize(value.replace(/\\/g, "/"))
    .replace(/^(\.\.(\/|$))+/, "")
    .replace(/^\/+/, "");

const createEmptyGraphData = (repoName = "") => ({
  nodes: [],
  edges: [],
  clusters: [],
  processes: [],
  summary: {
    repoName,
    totalFiles: 0,
    totalSymbols: 0,
    totalEdges: 0,
    languages: {},
    entryPoints: [],
    hubFiles: [],
  },
});

const mergeCodegraphIntoGraphData = (baseGraphData, codegraphData, repoName = "") => {
  const merged = baseGraphData || createEmptyGraphData(repoName);
  const languages = { ...(merged.summary?.languages || {}) };
  if (codegraphData?.stats?.pythonFileCount) {
    languages.Python = Math.max(languages.Python || 0, codegraphData.stats.pythonFileCount);
  }

  return {
    ...merged,
    summary: {
      ...(merged.summary || createEmptyGraphData(repoName).summary),
      repoName: merged.summary?.repoName || repoName,
      totalFiles: Math.max(merged.summary?.totalFiles || 0, codegraphData?.stats?.pythonFileCount || 0),
      totalEdges: Math.max(merged.summary?.totalEdges || 0, merged.edges?.length || 0),
      languages,
      keyTechnologies: Array.from(
        new Set([...(merged.summary?.keyTechnologies || []), "xnuinside/codegraph"])
      ),
    },
    codegraph: codegraphData,
  };
};

async function stagePythonFilesForCodegraph(chunks) {
  const pythonFiles = parseChunksToFiles(chunks).filter(
    (file) => path.extname(file.filePath).toLowerCase() === ".py"
  );

  if (pythonFiles.length === 0) {
    return null;
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "repo-codegraph-"));
  for (const file of pythonFiles) {
    const safeRelativePath = sanitizeRelativePath(file.filePath);
    if (!safeRelativePath) continue;
    const targetPath = path.join(tempDir, safeRelativePath);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, file.content, "utf8");
  }

  return {
    tempDir,
    pythonFiles,
  };
}

async function runPythonCodegraph(chunks) {
  const staged = await stagePythonFilesForCodegraph(chunks);
  if (!staged) return null;

  const pythonCandidates = [process.env.PYTHON_BIN, "python3", "python"].filter(Boolean);
  let lastError = null;

  try {
    for (const pythonBin of pythonCandidates) {
      try {
        const { stdout } = await execFileAsync(
          pythonBin,
          [CODEGRAPH_BRIDGE_PATH, staged.tempDir],
          {
            cwd: __dirname,
            timeout: DEFAULT_PYTHON_CODEGRAPH_TIMEOUT_MS,
            maxBuffer: 20 * 1024 * 1024,
          }
        );
        if (!stdout?.trim()) {
          throw new Error("Codegraph bridge returned an empty payload");
        }
        const parsed = JSON.parse(stdout);
        parsed.stats = {
          ...(parsed.stats || {}),
          stagedPythonFiles: staged.pythonFiles.length,
        };
        return parsed;
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    await fs.promises.rm(staged.tempDir, { recursive: true, force: true }).catch(() => {});
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}


app.post("/api/ingest", async (req, res) => {
  let tempDir;
  try {
    console.log(`📥 Ingest: ${req.body?.repoUrl}`);

    const { repoUrl, token } = req.body ?? {};

    // ── Optional projectId ─────────────────────────────────────────────────
    // Supplied by Processing.tsx when the user is authenticated and a project
    // row already exists. Kept in scope so it can be passed to the graph step
    // (Step 7) and echoed back in the response.
    const projectId = (typeof req.body?.projectId === "string" && req.body.projectId)
      ? req.body.projectId
      : null;

    if (!repoUrl || typeof repoUrl !== "string") {
      console.log(`❌ Missing repoUrl in request`);
      return res.status(400).json({ error: "repoUrl is required" });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(repoUrl);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid URL format",
        detail:
          "The provided URL is not valid. Expected format: https://github.com/user/repo",
      });
    }

    if (!["https:", "http:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        error: "Invalid protocol",
        detail: "URL must use http or https protocol",
      });
    }

    console.log(`✓ URL validated: ${repoUrl}`);
    if (projectId) {
      console.log(`🔖 projectId: ${projectId.substring(0, 8)}... — clone kept alive for graph step`);
    }

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "repo-ingest-"));
    const repoDir = path.join(tempDir, "src");
    const startTime = Date.now();

    const requestedBranchRaw = typeof req.body?.branch === "string" ? req.body.branch : "";
    const requestedBranch = requestedBranchRaw.replace(/^refs\/heads\//, "").trim() || null;
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const isGitHub = parsedUrl.hostname === "github.com" && pathParts.length >= 2;
    const [owner, repoRaw] = isGitHub ? [pathParts[0], (pathParts[1] || "").replace(/\.git$/, "")] : [null, null];
    const useArchive = isGitHub && process.env.INGEST_USE_ARCHIVE !== "false";

    const maxFiles = Number(process.env.INGEST_MAX_FILES || DEFAULT_MAX_FILES);
    const maxBytes = Number(process.env.INGEST_MAX_TOTAL_BYTES || DEFAULT_MAX_TOTAL_BYTES);
    const maxFileBytes = Number(process.env.INGEST_MAX_FILE_BYTES || DEFAULT_MAX_FILE_BYTES);

    const doGitClone = async (ref) => {
      await withTimeout(
        () =>
          git.clone({
            fs,
            http,
            dir: repoDir,
            url: repoUrl,
            ref: ref || undefined,
            singleBranch: true,
            depth: 1,
            noCheckout: false,
            onAuth: token ? () => ({ username: token, password: "x-oauth-basic" }) : undefined,
            corsProxy: undefined,
          }),
        DEFAULT_CLONE_TIMEOUT_MS,
        "Git clone timeout. Repo may be too large or network slow."
      );
    };

    try {
      let ingestResult = null;

      if (isGitHub && owner && repoRaw && process.env.INGEST_USE_GITHUB_API !== "false") {
        try {
          const t0Api = Date.now();
          ingestResult = await ingestFromGitHubApi({
            owner,
            repo: repoRaw,
            requestedBranch,
            token,
            maxFiles,
            maxBytes,
            maxFileBytes,
          });
          console.log(
            `✓ GitHub API ingest complete (${ingestResult.branch}): ` +
            `${ingestResult.includedFiles} files, ${formatBytes(ingestResult.totalBytes)} in ${((Date.now() - t0Api) / 1000).toFixed(1)}s`
          );
        } catch (apiErr) {
          console.warn(`GitHub API ingest failed (${apiErr instanceof Error ? apiErr.message : String(apiErr)}), falling back to archive/clone`);
        }
      }

      if (!ingestResult) {
        let fallbackResolvedBranch = requestedBranch;
        let fallbackMode = "clone";

        if (useArchive && owner && repoRaw) {
          const branchCandidates = [...new Set([requestedBranch, "main", "master"].filter(Boolean))];
          let archiveSuccess = false;
          let archiveError = null;

          for (const candidateBranch of branchCandidates) {
            try {
              const t0 = Date.now();
              await fetchGitHubArchive(owner, repoRaw, candidateBranch, repoDir);
              console.log(`✓ Archive extracted from ${candidateBranch} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
              archiveSuccess = true;
              fallbackResolvedBranch = candidateBranch;
              fallbackMode = "archive";
              break;
            } catch (archErr) {
              archiveError = archErr;
              const message = archErr instanceof Error ? archErr.message : String(archErr);
              console.warn(`Archive ${candidateBranch} failed (${message})`);
              if (message.includes("timeout")) {
                // Don't burn multiple timeout windows; fall back to git clone.
                break;
              }
              await fs.promises.rm(repoDir, { recursive: true, force: true }).catch(() => { });
              await fs.promises.mkdir(repoDir, { recursive: true });
            }
          }

          if (!archiveSuccess) {
            if (archiveError) {
              const message = archiveError instanceof Error ? archiveError.message : String(archiveError);
              console.warn(`Archive path failed (${message}), using git clone`);
            }

            const cloneBranchCandidates = [
              requestedBranch,
              null,
              "main",
              "master",
            ].filter((candidate, index, all) => all.indexOf(candidate) === index);

            let cloneSucceeded = false;
            let cloneError = null;
            for (const candidate of cloneBranchCandidates) {
              try {
                await fs.promises.rm(repoDir, { recursive: true, force: true }).catch(() => { });
                await fs.promises.mkdir(repoDir, { recursive: true });
                await doGitClone(candidate);
                console.log(`✓ Git clone complete${candidate ? ` (${candidate})` : " (default branch)"}`);
                fallbackResolvedBranch =
                  candidate ||
                  await git.currentBranch({
                    fs,
                    dir: repoDir,
                    fullname: false,
                  }).catch(() => null);
                fallbackMode = "clone";
                cloneSucceeded = true;
                break;
              } catch (err) {
                cloneError = err;
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`Git clone failed${candidate ? ` (${candidate})` : " (default branch)"}: ${message}`);
                if (message.includes("timeout")) {
                  break;
                }
              }
            }

            if (!cloneSucceeded && cloneError) {
              throw cloneError;
            }
          }
        } else {
          await fs.promises.mkdir(repoDir, { recursive: true });
          await doGitClone(requestedBranch);
          fallbackResolvedBranch =
            requestedBranch ||
            await git.currentBranch({
              fs,
              dir: repoDir,
              fullname: false,
            }).catch(() => null);
        }

        ingestResult = {
          ...(await walkAndRead(repoDir, {
            maxFiles,
            maxBytes: maxBytes,
            maxFileBytes,
          })),
          mode: fallbackMode,
          branch: fallbackResolvedBranch || null,
        };
      }

      const { chunks, includedFiles, skippedFiles, totalBytes, diagnostics } = ingestResult;
      if (includedFiles === 0) {
        throw createHttpError({
          message: "No supported source files found",
          detail: buildNoEligibleSourceFilesDetail(
            diagnostics,
            ingestResult.branch || requestedBranch || null
          ),
          status: 422,
          code: "no_supported_source_files",
          meta: {
            resolvedBranch: ingestResult.branch || requestedBranch || null,
            diagnostics: diagnostics || null,
          },
        });
      }

      const durationMs = Date.now() - startTime;
      console.log(`✓ Ingestion: ${includedFiles} files, ${formatBytes(totalBytes)}, ${(durationMs / 1000).toFixed(1)}s`);

      const allowedOrigin = getAllowedOrigin(req);
      if (allowedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      }

      // ── Code Graph RAG analysis ──────────────────────────────────────────────
      let graphData = null;
      try {
        const t0Graph = Date.now();
        graphData = buildCodeGraph(chunks);
        const baseGraphDurationMs = Date.now() - t0Graph;
        const hasPythonFiles = parseChunksToFiles(chunks).some(
          (file) => path.extname(file.filePath).toLowerCase() === ".py"
        );

        if (hasPythonFiles) {
          try {
            const t0PythonGraph = Date.now();
            const pythonCodegraph = await runPythonCodegraph(chunks);
            const pythonGraphDurationMs = Date.now() - t0PythonGraph;
            if (pythonCodegraph) {
              graphData = mergeCodegraphIntoGraphData(
                graphData,
                pythonCodegraph,
                repoRaw || repoUrl || ""
              );
              console.log(JSON.stringify({
                event: "python_codegraph_indexed",
                projectId: projectId ?? null,
                durationMs: pythonGraphDurationMs,
                stats: pythonCodegraph.stats,
                message:
                  `xnuinside/codegraph: ${pythonCodegraph.stats?.moduleCount || 0} modules, ` +
                  `${pythonCodegraph.stats?.entityCount || 0} entities, ` +
                  `${pythonCodegraph.stats?.linkCount || 0} links (${pythonGraphDurationMs}ms)`,
              }));
            }
          } catch (pythonGraphErr) {
            console.warn(
              `⚠️  [xnuinside/codegraph] Python analysis failed (non-fatal):`,
              pythonGraphErr.message
            );
          }
        }

        if (graphData) {
          // Populate repoName in summary
          if (graphData.summary) {
            graphData.summary.repoName = repoRaw || repoUrl || '';
          }
          const nc = graphData.nodes?.length || 0;
          const ec = graphData.edges?.length || 0;
          const cc = graphData.clusters?.length || 0;
          const pc = graphData.processes?.length || 0;
          const arch = graphData.summary?.architecturePattern || 'unknown';
          const techs = graphData.summary?.keyTechnologies?.join(', ') || 'none';
          console.log(JSON.stringify({
            event: "graph_indexed",
            projectId: projectId ?? null,
            durationMs: baseGraphDurationMs,
            stats: { nodes: nc, edges: ec, clusters: cc, processes: pc },
            architecture: arch,
            technologies: techs,
            hasPythonCodegraph: Boolean(graphData.codegraph),
            message:
              `Code Graph RAG: ${nc} nodes, ${ec} edges, ${cc} clusters, ${pc} flows | ` +
              `${arch} | ${techs} (${baseGraphDurationMs}ms)`
          }));
        } else {
          console.log(JSON.stringify({
            event: "graph_skipped",
            projectId: projectId ?? null,
            reason: "no_data",
            message: "Code Graph RAG produced no data."
          }));
        }
      } catch (graphErr) {
        console.warn(`⚠️  [Code Graph RAG] Analysis failed (non-fatal):`, graphErr.message);
        graphData = null;
      }

      // ── Send response ────────────────────────────────────────────────
      res.json({
        repoUrl,
        stats: { includedFiles, skippedFiles, totalBytes, totalBytesFormatted: formatBytes(totalBytes), durationMs },
        content: chunks.join(""),
        ingestionMode: ingestResult.mode || "clone",
        resolvedBranch: ingestResult.branch || requestedBranch || null,
        graphData,  // null if skipped/failed, enhanced graph object otherwise
        projectId: projectId ?? null,
      });
    } catch (error) {
      console.error("Ingestion error:", error);
      let statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      let errorMessage =
        typeof error?.publicMessage === "string" && error.publicMessage
          ? error.publicMessage
          : "Ingestion failed";
      let detail =
        typeof error?.publicDetail === "string" && error.publicDetail
          ? error.publicDetail
          : error instanceof Error
            ? error.message
            : String(error);
      let errorCode =
        typeof error?.errorCode === "string" && error.errorCode
          ? error.errorCode
          : undefined;
      const errorMeta = error?.meta ?? undefined;
      if (detail.includes("not found") || detail.includes("404")) {
        errorMessage = "Repository not found";
        detail = "The repository doesn't exist or is private. Check the URL and access permissions.";
        statusCode = 404;
        errorCode = errorCode || "repository_not_found";
      } else if (detail.includes("authentication") || detail.includes("401")) {
        errorMessage = "Authentication required";
        detail = "This repository is private. Authentication is not yet supported.";
        statusCode = 401;
        errorCode = errorCode || "authentication_required";
      } else if (detail.includes("timeout")) {
        errorMessage = "Connection timeout";
        detail = "The repository took too long to process. Try again or use a smaller repo.";
        statusCode = 504;
        errorCode = errorCode || "connection_timeout";
      } else if (detail.includes("ENOTFOUND")) {
        errorMessage = "Network error";
        detail = "Cannot reach GitHub. Check your internet connection.";
        statusCode = 502;
        errorCode = errorCode || "network_error";
      }
      if (!res.headersSent) {
        const allowedOrigin = getAllowedOrigin(req);
        if (allowedOrigin) {
          res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
        }
        res.status(statusCode).json({
          error: errorMessage,
          detail,
          ...(errorCode ? { code: errorCode } : {}),
          ...(errorMeta ? { meta: errorMeta } : {}),
        });
      }
    }
  } catch (outerError) {
    // Catch any unexpected errors outside the main try block
    console.error("Unexpected error in route handler:", outerError);
    console.error("Stack trace:", outerError instanceof Error ? outerError.stack : 'No stack trace');
    if (!res.headersSent) {
      // Ensure CORS headers are set even for unexpected errors
      const allowedOrigin = getAllowedOrigin(req);
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      }
      res.status(500).json({
        error: "Internal server error",
        detail: outerError instanceof Error ? outerError.message : "An unexpected error occurred",
      });
    }
  } finally {
    // ── Guaranteed cleanup path ─────────────────────────────────────────
    // Always runs after the request and graph logic completes,
    // ensuring the directory is unlinked even if the server threw wildly.
    if (tempDir) {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        console.log(`🗑  Cleaned temp dir: ${tempDir}`);
      } catch (cleanupError) {
        console.error("Cleanup error (non-fatal):", cleanupError);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FOLDER UPLOAD ENDPOINT — accepts drag-and-drop folder contents
// Files are sent client-side as JSON array [{path, content}, ...]
// ─────────────────────────────────────────────────────────────────────────────

// Increase body limit for folder uploads (up to 20 MB)
app.use('/api/ingest-folder', express.json({ limit: '20mb' }));

app.post("/api/ingest-folder", async (req, res) => {
  try {
    console.log(`📂 Folder upload ingest`);

    const { files: uploadedFiles, folderName, projectId: rawProjectId } = req.body ?? {};
    const projectId = (typeof rawProjectId === 'string' && rawProjectId) ? rawProjectId : null;

    if (!uploadedFiles || !Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
      return res.status(400).json({ error: "No files provided. Upload at least one file." });
    }

    const startTime = Date.now();
    const name = folderName || 'uploaded-folder';
    console.log(`📂 Processing ${uploadedFiles.length} files from folder: ${name}`);

    // Build chunks in the same format as walkAndRead produces
    const chunks = [];
    let totalBytes = 0;
    let includedFiles = 0;
    let skippedFiles = 0;
    const maxFiles = Number(process.env.INGEST_MAX_FILES || DEFAULT_MAX_FILES);
    const maxBytes = Number(process.env.INGEST_MAX_TOTAL_BYTES || DEFAULT_MAX_TOTAL_BYTES);
    const maxFileBytes = Number(process.env.INGEST_MAX_FILE_BYTES || DEFAULT_MAX_FILE_BYTES);

    for (const file of uploadedFiles) {
      if (!file.path || typeof file.content !== 'string') {
        skippedFiles++;
        continue;
      }

      // Skip ignored directories and non-code (config, lock, docs)
      const relPath = file.path.replace(/\\/g, '/');
      if (isIgnoredRelativePath(relPath)) {
        skippedFiles++;
        continue;
      }
      if (!shouldIncludeAsCode(relPath)) {
        skippedFiles++;
        continue;
      }

      // Check extension
      const ext = path.extname(relPath).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        skippedFiles++;
        continue;
      }

      // Check file size
      const fileBytes = Buffer.byteLength(file.content, 'utf8');
      if (fileBytes > maxFileBytes) {
        skippedFiles++;
        continue;
      }

      // Check totals
      if (totalBytes + fileBytes > maxBytes || includedFiles >= maxFiles) {
        skippedFiles++;
        continue;
      }

      chunks.push(`\n\n----- FILE: ${relPath} -----\n${file.content}`);
      totalBytes += fileBytes;
      includedFiles++;
    }

    if (includedFiles === 0) {
      return res.status(400).json({
        error: "No supported files found",
        detail: "The uploaded folder doesn't contain any supported source files, or all files were too large."
      });
    }

    const durationMs = Date.now() - startTime;
    console.log(`✓ Folder ingestion: ${includedFiles} files, ${formatBytes(totalBytes)}, ${(durationMs / 1000).toFixed(1)}s`);

    // Set CORS
    const allowedOrigin = getAllowedOrigin(req);
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    }

    // Build Code Graph RAG
    let graphData = null;
    try {
      const t0Graph = Date.now();
      graphData = buildCodeGraph(chunks);
      const graphDurationMs = Date.now() - t0Graph;
      const hasPythonFiles = parseChunksToFiles(chunks).some(
        (file) => path.extname(file.filePath).toLowerCase() === ".py"
      );

      if (hasPythonFiles) {
        try {
          const pythonCodegraph = await runPythonCodegraph(chunks);
          if (pythonCodegraph) {
            graphData = mergeCodegraphIntoGraphData(graphData, pythonCodegraph, name);
          }
        } catch (pythonGraphErr) {
          console.warn(
            `⚠️ [xnuinside/codegraph] Folder analysis failed (non-fatal):`,
            pythonGraphErr.message
          );
        }
      }

      if (graphData) {
        if (graphData.summary) {
          graphData.summary.repoName = name;
        }
        const nc = graphData.nodes?.length || 0;
        const ec = graphData.edges?.length || 0;
        const pyModules = graphData.codegraph?.stats?.moduleCount || 0;
        console.log(
          `✓ Code Graph RAG (folder): ${nc} nodes, ${ec} edges, ${pyModules} python modules (${graphDurationMs}ms)`
        );
      }
    } catch (graphErr) {
      console.warn(`⚠️ [Code Graph RAG] Folder analysis failed (non-fatal):`, graphErr.message);
      graphData = null;
    }

    res.json({
      repoUrl: `local://${name}`,
      stats: { includedFiles, skippedFiles, totalBytes, totalBytesFormatted: formatBytes(totalBytes), durationMs },
      content: chunks.join(""),
      ingestionMode: "folder-upload",
      resolvedBranch: null,
      graphData,
      projectId: projectId ?? null,
    });
  } catch (error) {
    console.error("Folder upload error:", error);
    const allowedOrigin = getAllowedOrigin(req);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(500).json({
      error: "Folder upload failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// PORT from environment (Render, Fly, etc.), default 8080 for local dev
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0"; // Bind to all interfaces

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit immediately, let the server try to handle it
});

const server = app.listen(port, host, () => {
  console.log(`✅ Ingestion server running on http://${host}:${port}`);
  console.log(`✅ Health check: http://${host}:${port}/api/health`);
  console.log(`✅ Ingest endpoint: http://${host}:${port}/api/ingest`);
  console.log(`✅ Folder upload: http://${host}:${port}/api/ingest-folder`);
  console.log(`✅ Process PID: ${process.pid}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
    process.exit(1);
  } else {
    // Don't exit on other errors, let it retry
    console.error('Server error (non-fatal):', error.message);
  }
});

// Keep process alive
server.on('listening', () => {
  console.log('✅ Server is listening and ready to accept connections');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
