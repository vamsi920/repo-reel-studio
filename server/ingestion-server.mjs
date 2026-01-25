import express from "express";
import cors from "cors";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const app = express();

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
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      ingest: "/api/ingest",
    },
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint - must respond quickly
app.get("/api/health", (_req, res) => {
  res.status(200).json({
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
  let fileCount = 0;

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
          fileCount++;
          // Log progress every 50 files for large repos
          if (fileCount % 50 === 0) {
            console.log(`  📄 Found ${fileCount} files so far...`);
          }
        }
      }
    }
  };

  await visit(rootDir);
  console.log(`✓ Found ${fileCount} total files to process`);
  return entries;
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

app.post("/api/ingest", async (req, res) => {
  let tempDir;
  try {
    console.log(`\n📥 Ingestion request received for: ${req.body?.repoUrl}`);
    console.log(`📍 Request origin: ${req.headers.origin || 'unknown'}`);
    console.log(`📍 Request headers:`, JSON.stringify(req.headers, null, 2));

    const { repoUrl, branch, token } = req.body ?? {};

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

    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "repo-ingest-")
    );
    const repoDir = path.join(tempDir, crypto.randomUUID());
    const startTime = Date.now();

    try {
    console.log(`📁 Creating temp directory: ${repoDir}`);
    await fs.promises.mkdir(repoDir, { recursive: true });
    
    console.log(`🔄 Starting git clone for: ${repoUrl}`);
    const cloneStartTime = Date.now();
    
    // Increased timeout for cloud deploys (120s) - network can be slower than local
    const cloneTimeout = 120000; // 2 minutes
    let cloneProgress = 0;
    
    // Progress tracking
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - cloneStartTime) / 1000).toFixed(1);
      console.log(`⏳ Git clone in progress... (${elapsed}s elapsed)`);
    }, 10000); // Log every 10 seconds
    
    try {
      const clonePromise = git.clone({
        fs,
        http,
        dir: repoDir,
        url: repoUrl,
        ref: branch || undefined,
        singleBranch: true,
        depth: 1, // Shallow clone - only latest commit
        noCheckout: false, // We need the files
        onAuth: token
          ? () => ({
              username: token,
              password: "x-oauth-basic",
            })
          : undefined,
        corsProxy: undefined, // GitHub doesn't need CORS proxy
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          clearInterval(progressInterval);
          reject(new Error("Git clone timeout after 120 seconds. Network may be slow or repository is too large."));
        }, cloneTimeout);
      });
      
      await Promise.race([clonePromise, timeoutPromise]);
      clearInterval(progressInterval);
      
      const cloneDuration = ((Date.now() - cloneStartTime) / 1000).toFixed(2);
      console.log(`✓ Git clone completed successfully in ${cloneDuration}s`);
    } catch (cloneError) {
      clearInterval(progressInterval);
      throw cloneError;
    }

    console.log(`📂 Scanning repository files...`);
    const files = await walkFiles(repoDir);
    
    if (files.length === 0) {
      throw new Error("No files found in repository. Make sure the repository contains supported file types.");
    }
    
    const maxTotalBytes = Number(
      process.env.INGEST_MAX_TOTAL_BYTES || DEFAULT_MAX_TOTAL_BYTES
    );
    const chunks = [];
    let totalBytes = 0;
    let includedFiles = 0;
    let skippedFiles = 0;

    console.log(`📝 Processing ${files.length} files...`);
    const processStartTime = Date.now();
    
    // Process files in batches for better performance
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const relativePath = path.relative(repoDir, filePath);
      
      // Log progress every 20 files
      if (i > 0 && i % 20 === 0) {
        const elapsed = ((Date.now() - processStartTime) / 1000).toFixed(1);
        console.log(`  ⚡ Processed ${i}/${files.length} files (${elapsed}s)...`);
      }
      
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
    
    const processDuration = ((Date.now() - processStartTime) / 1000).toFixed(2);
    console.log(`✓ File processing completed in ${processDuration}s`);

    const durationMs = Date.now() - startTime;

    console.log(`✓ Ingestion complete:`);
    console.log(`  - Files included: ${includedFiles}`);
    console.log(`  - Files skipped: ${skippedFiles}`);
    console.log(`  - Total size: ${formatBytes(totalBytes)}`);
    console.log(`  - Duration: ${(durationMs / 1000).toFixed(2)}s\n`);

    // Ensure CORS headers are set before sending response
    const allowedOrigin = getAllowedOrigin(req);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
    
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
        "The repository took too long to clone. This can happen on some hosting due to slower network speeds. Try again, or the repository might be too large.";
    } else if (detail.includes("ENOTFOUND")) {
      errorMessage = "Network error";
      detail = "Cannot reach GitHub. Check your internet connection.";
    }

      if (!res.headersSent) {
        // Ensure CORS headers are set even for errors
        const allowedOrigin = getAllowedOrigin(req);
        if (allowedOrigin) {
          res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        }
        res.status(500).json({
          error: errorMessage,
          detail,
        });
      }
    } finally {
      // Always clean up temp directory
      try {
        if (tempDir) {
          await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.error("Cleanup error (non-fatal):", cleanupError);
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
    // Clean up temp directory if it was created
    try {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error("Cleanup error (non-fatal):", cleanupError);
    }
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
