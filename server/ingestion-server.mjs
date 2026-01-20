import express from "express";
import cors from "cors";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "repo-ingestion-server",
    timestamp: new Date().toISOString(),
  });
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
]);

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

const DEFAULT_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

const readTextFile = async (filePath) => {
  const stat = await fs.promises.stat(filePath);
  const maxFileBytes = Number(
    process.env.INGEST_MAX_FILE_BYTES || DEFAULT_MAX_FILE_BYTES
  );
  if (stat.size > maxFileBytes) {
    return { skipped: true, reason: "file_too_large", bytes: stat.size };
  }
  const content = await fs.promises.readFile(filePath, "utf8");
  return { skipped: false, content, bytes: Buffer.byteLength(content, "utf8") };
};

const walkFiles = async (rootDir) => {
  const entries = [];

  const visit = async (currentDir) => {
    const dirEntries = await fs.promises.readdir(currentDir, {
      withFileTypes: true,
    });
    for (const entry of dirEntries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) {
          continue;
        }
        await visit(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXTS.has(ext)) {
          entries.push(fullPath);
        }
      }
    }
  };

  await visit(rootDir);
  return entries;
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

app.post("/api/ingest", async (req, res) => {
  console.log(`\n📥 Ingestion request received for: ${req.body?.repoUrl}`);

  const { repoUrl, branch, token } = req.body ?? {};

  if (!repoUrl || typeof repoUrl !== "string") {
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

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "repo-ingest-")
  );
  const repoDir = path.join(tempDir, crypto.randomUUID());
  const startTime = Date.now();

  try {
    await fs.promises.mkdir(repoDir, { recursive: true });
    await git.clone({
      fs,
      http,
      dir: repoDir,
      url: repoUrl,
      ref: branch || undefined,
      singleBranch: true,
      depth: 1,
      onAuth: token
        ? () => ({
            username: token,
            password: "x-oauth-basic",
          })
        : undefined,
    });

    const files = await walkFiles(repoDir);
    const maxTotalBytes = Number(
      process.env.INGEST_MAX_TOTAL_BYTES || DEFAULT_MAX_TOTAL_BYTES
    );
    const chunks = [];
    let totalBytes = 0;
    let includedFiles = 0;
    let skippedFiles = 0;

    for (const filePath of files) {
      const relativePath = path.relative(repoDir, filePath);
      const result = await readTextFile(filePath);
      if (result.skipped) {
        skippedFiles += 1;
        continue;
      }
      if (totalBytes + result.bytes > maxTotalBytes) {
        skippedFiles += 1;
        continue;
      }
      chunks.push(`\n\n----- FILE: ${relativePath} -----\n${result.content}`);
      totalBytes += result.bytes;
      includedFiles += 1;
    }

    const durationMs = Date.now() - startTime;

    console.log(`✓ Ingestion complete:`);
    console.log(`  - Files included: ${includedFiles}`);
    console.log(`  - Files skipped: ${skippedFiles}`);
    console.log(`  - Total size: ${formatBytes(totalBytes)}`);
    console.log(`  - Duration: ${(durationMs / 1000).toFixed(2)}s\n`);

    res.json({
      repoUrl,
      stats: {
        includedFiles,
        skippedFiles,
        totalBytes,
        totalBytesFormatted: formatBytes(totalBytes),
        durationMs,
      },
      content: chunks.join(""),
    });
  } catch (error) {
    console.error("Ingestion error:", error);

    let errorMessage = "Ingestion failed";
    let detail = error instanceof Error ? error.message : String(error);

    // Provide more helpful error messages
    if (detail.includes("not found") || detail.includes("404")) {
      errorMessage = "Repository not found";
      detail =
        "The repository doesn't exist or is private. Check the URL and access permissions.";
    } else if (detail.includes("authentication") || detail.includes("401")) {
      errorMessage = "Authentication required";
      detail =
        "This repository is private. Authentication is not yet supported.";
    } else if (detail.includes("timeout")) {
      errorMessage = "Connection timeout";
      detail =
        "The repository took too long to clone. Try again or check your network.";
    } else if (detail.includes("ENOTFOUND")) {
      errorMessage = "Network error";
      detail = "Cannot reach GitHub. Check your internet connection.";
    }

    res.status(500).json({
      error: errorMessage,
      detail,
    });
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0"; // Bind to all interfaces for Fly.io

app.listen(port, host, () => {
  console.log(`Ingestion server running on http://${host}:${port}`);
  console.log(`Health check available at http://${host}:${port}/api/health`);
  console.log(`Ingest endpoint available at http://${host}:${port}/api/ingest`);
});
