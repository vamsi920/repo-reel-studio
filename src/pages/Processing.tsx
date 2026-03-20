import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockManifest } from "@/data/mockManifest";
import { useAuth } from "@/context/AuthContext";
import { projectsService } from "@/lib/db";
import { generateManifestWithGemini } from "@/lib/geminiDirector";
import {
  buildQualityReport,
  generateManifestWithQualityPipeline,
} from "@/lib/videoPipelineV2";
import type { GitNexusGraphData } from "@/lib/types";
import { parseRepoContent } from "@/lib/parseRepoContent";
import { generateAllSceneAudio } from "@/lib/googleTTS";
import { supabase } from "@/lib/supabase";
import {
  GRAPH_BUCKET,
  graphArtifactPrefix,
  graphCsvObjectKey,
  graphJsonObjectKey,
} from "@/lib/storage";
import {
  buildGraphTutorialBlueprint,
  buildManifestFromBlueprint,
  mergeManifestWithBlueprint,
} from "@/lib/tutorialBlueprint";
import { serializeCodegraphCsvRows } from "@/lib/upstreamCodegraph";
import {
  USE_MOCK_MANIFEST,
  API_URL,
  GOOGLE_TTS_ENABLED,
  VIDEO_PIPELINE_V2_ENABLED,
} from "@/env";
import type { VideoManifest, VideoScene } from "@/lib/types";
import {
  loadFolderUploadSession,
  resolveRepoSourceFromInput,
} from "@/lib/projectSource";
import { syncProjectWorkspaceToSession } from "@/lib/projectSession";
import iconUrl from "../../icon.png";

const phase1Steps = [
  { text: "Initializing ingestion pipeline...", duration: 400 },
  { text: "Connecting to ingestion server...", duration: 500 },
  { text: "Validating repository URL...", duration: 300 },
  { text: "Fetching repository tree via GitHub API (fast path)...", duration: 900 },
  { text: "Falling back to archive/shallow git clone if needed...", duration: 700 },
  { text: "Walking repository tree...", duration: 600 },
  { text: "Filtering source files and size limits...", duration: 500 },
  { text: "Parsing file contents...", duration: 400 },
  { text: "Bundling code content...", duration: 600 },
];

const phase2Steps = [
  { text: "Analyzing code structure...", duration: 400 },
  { text: "Building scene manifest from template...", duration: 500 },
  { text: "Mapping file references to scenes...", duration: 400 },
  { text: "Calculating scene durations...", duration: 300 },
  { text: "Preparing video storyboard...", duration: 400 },
  { text: "Finalizing manifest data...", duration: 300 },
];

/** Rotating messages so the screen feels alive during long runs. */
const LOADING_SUBTITLES = [
  "Fetching and parsing repository...",
  "Analyzing code structure with GitNexus...",
  "Indexing files and dependencies...",
  "Building knowledge graph...",
  "Still working — large repos take a few minutes...",
  "Almost there...",
];

type PhaseStatus = "idle" | "running" | "complete" | "error";

type IngestionSnapshot = {
  includedFiles: number;
  skippedFiles: number;
  totalBytesFormatted: string;
  durationMs: number;
  ingestionMode?: string;
  resolvedBranch?: string;
};

type ManifestSnapshot = {
  sceneCount: number;
  totalDurationSeconds: number;
  readyForTts: boolean;
  title: string;
  blockerCount: number;
  warningCount: number;
  evidenceCoverage: number;
  visualSync: number;
  topBlocker?: string;
  topWarning?: string;
};

type ProcessingErrorState = {
  title: string;
  detail: string;
  code?: string;
};

const formatTime = () => {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const Processing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [phase1Status, setPhase1Status] = useState<PhaseStatus>("idle");
  const [phase2Status, setPhase2Status] = useState<PhaseStatus>("idle");
  const [retryKey, setRetryKey] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GitNexusGraphData | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [ingestionSnapshot, setIngestionSnapshot] = useState<IngestionSnapshot | null>(null);
  const [manifestSnapshot, setManifestSnapshot] = useState<ManifestSnapshot | null>(null);
  const [processingError, setProcessingError] = useState<ProcessingErrorState | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Elapsed time while processing (so UI can show "still working" and rotating messages)
  useEffect(() => {
    const running = phase1Status === "running" || phase2Status === "running";
    if (!running) {
      setElapsedSeconds(0);
      return;
    }
    const t = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [phase1Status, phase2Status]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((message: string) => {
    const timestamp = formatTime();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(`[PROCESSING] ${message}`);
  }, []);

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  const isFolderMode = useMemo(() => {
    return searchParams.get("mode") === "folder";
  }, [searchParams]);

  const requestedProjectId = useMemo(
    () => searchParams.get("project"),
    [searchParams]
  );

  const repoInputUrl = useMemo(() => {
    if (isFolderMode) return '';
    const encodedRepo = searchParams.get("repo") || "";
    return encodedRepo ? decodeURIComponent(encodedRepo) : "";
  }, [searchParams, isFolderMode]);

  const folderData = useMemo(() => {
    if (!isFolderMode) return null;
    return loadFolderUploadSession();
  }, [isFolderMode]);

  const sourceDescriptor = useMemo(() => {
    if (isFolderMode && folderData) {
      return {
        repoUrl: folderData.repoUrl,
        repoName: folderData.repoName,
      };
    }

    try {
      return resolveRepoSourceFromInput(repoInputUrl);
    } catch {
      return {
        repoUrl: repoInputUrl,
        repoName: repoInputUrl || "Unknown Repository",
      };
    }
  }, [folderData, isFolderMode, repoInputUrl]);

  const repoUrl = sourceDescriptor.repoUrl;
  const repoName = sourceDescriptor.repoName;

  useEffect(() => {
    if (!repoInputUrl && !isFolderMode) {
      setPhase1Status("error");
      setProcessingError({
        title: "Missing repository URL",
        detail: "Go back and enter a repository URL before starting processing.",
      });
      addLog("ERROR: Missing repository URL. Please go back and enter a URL.");
      return;
    }

    if (isFolderMode && !folderData) {
      setPhase1Status("error");
      setProcessingError({
        title: "Missing folder upload",
        detail: "Go back and upload a folder before starting processing.",
      });
      addLog("ERROR: No folder data found. Please go back and upload a folder.");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    // Reset states on retry
    if (retryKey > 0) {
      setPhase1Status("idle");
      setPhase2Status("idle");
      setProgress(0);
      setLogs([]);
      setCurrentStep("");
      setProcessingError(null);
    }

    const runProcessing = async () => {
      // Note: Processing can work without auth, but projects won't be saved to DB
      if (!user?.id) {
        addLog("INFO: Not authenticated - project will not be saved to database");
        addLog("  → Sign in to save projects and access Studio");
      }

      // Create project in Supabase
      let currentProjectId: string | null = null;

      // Try to create project in database (only if authenticated)
      if (user?.id) {
        // Verify database connection first
        try {
          addLog("Checking database connection...");
          const connectionCheck = await projectsService.checkConnection();
          if (!connectionCheck.connected) {
            throw new Error(connectionCheck.error || 'Database connection failed');
          }
          addLog("✓ Database connection verified");
        } catch (checkError: any) {
          addLog(`WARNING: Database check failed: ${checkError.message}`);
          addLog(`  → This might mean the 'projects' table doesn't exist yet`);
          addLog(`  → Please run the SQL schema from supabase-schema.sql in Supabase Dashboard`);
          addLog(`  → See DATABASE_SETUP.md for instructions`);
          addLog(`  → Continuing without database save...`);
        }
        try {
          let existingProject = null;

          if (requestedProjectId) {
            existingProject = await projectsService.getById(
              requestedProjectId,
              user.id
            );
          }

          if (!existingProject && repoUrl) {
            existingProject = await projectsService.getByRepoUrl(repoUrl, user.id);
          }

          if (
            existingProject &&
            existingProject.status === "ready" &&
            existingProject.manifest
          ) {
            addLog("Found an existing saved project for this source.");
            addLog("Opening the stored workspace instead of creating a duplicate.");
            syncProjectWorkspaceToSession(existingProject);
            navigate(`/studio?project=${existingProject.id}`, { replace: true });
            return;
          }

          if (existingProject) {
            currentProjectId = existingProject.id;
            setProjectId(existingProject.id);
            syncProjectWorkspaceToSession({
              id: existingProject.id,
              repo_url: existingProject.repo_url,
              manifest: null,
              repo_content: null,
              graph_data: null,
              repo_knowledge_graph: null,
            });
            addLog(
              `Reusing existing project workspace: ${existingProject.id.substring(
                0,
                8
              )}...`
            );

            await projectsService.update(existingProject.id, user.id, {
              status: "processing",
              title: `${repoName} - Video Walkthrough`,
            });
          } else {
            addLog("Creating project in database...");
            const project = await projectsService.create({
              user_id: user.id,
              repo_url: repoUrl,
              repo_name: repoName,
              title: `${repoName} - Video Walkthrough`,
              status: 'processing',
              manifest: null,
              duration_seconds: null,
            });
            currentProjectId = project.id;
            setProjectId(project.id);
            syncProjectWorkspaceToSession(project);
            addLog(`✓ Project created successfully: ${project.id.substring(0, 8)}...`);
          }
        } catch (error: any) {
          console.error('Failed to create project:', error);
          const errorMessage = error?.message || error?.error_description || 'Unknown error';
          const errorCode = error?.code || error?.status || '';
          const errorHint = error?.hint || '';

          addLog(`ERROR: Could not create project in database`);
          addLog(`  Error: ${errorMessage}`);
          if (errorCode) {
            addLog(`  Code: ${errorCode}`);
          }
          if (errorHint) {
            addLog(`  Hint: ${errorHint}`);
          }

          // Check for common issues and provide helpful messages
          if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
            addLog(`  → SOLUTION: Run the SQL schema in Supabase Dashboard`);
            addLog(`  → File: supabase-schema.sql`);
          } else if (errorMessage.includes('permission denied') || errorMessage.includes('RLS') || errorMessage.includes('policy')) {
            addLog(`  → SOLUTION: Check Row Level Security policies`);
            addLog(`  → Make sure RLS policies are created (see supabase-schema.sql)`);
          } else if (errorMessage.includes('JWT') || errorMessage.includes('token') || errorMessage.includes('auth')) {
            addLog(`  → SOLUTION: Authentication issue - please sign in again`);
          } else if (errorMessage.includes('null value') || errorMessage.includes('violates')) {
            addLog(`  → SOLUTION: Check that all required fields are provided`);
          }

          addLog(`  → Continuing without database save...`);
          // Continue processing even if DB save fails
        }
      } else {
        addLog("WARNING: User not authenticated - skipping database save");
        addLog("  → Sign in to save projects to your account");
      }

      // ===== PHASE 1: INGESTION =====
      setPhase1Status("running");
      addLog(`Starting video generation pipeline...`);
      addLog(`Target repository: ${repoName}`);
      addLog(`Full URL: ${repoUrl}`);
      setProgress(5);

      // Variable to hold repository content across phases (avoids sessionStorage quota issues)
      let repoContent: string = "";

      // Animate through phase 1 steps while ingestion runs
      const animateSteps = async (steps: typeof phase1Steps, startProgress: number, endProgress: number) => {
        let stepProgress = startProgress;
        const progressPerStep = (endProgress - startProgress) / steps.length;

        for (const step of steps) {
          if (cancelled) return;
          setCurrentStep(step.text);
          addLog(step.text);
          stepProgress += progressPerStep;
          setProgress(Math.round(stepProgress));
          await new Promise((resolve) => setTimeout(resolve, step.duration));
        }
      };

      // Start step animation
      const stepsToAnimate = [...phase1Steps];
      if (currentProjectId) {
        stepsToAnimate.push({ text: "Building code graph (analyzing structure)...", duration: 800 });
      }
      const animationPromise = animateSteps(stepsToAnimate, 5, 55);

      // Run actual ingestion
      try {
        // Determine if folder mode or git mode
        let ingestUrl: string;
        let requestBody: any;

        if (isFolderMode && folderData) {
          // Folder upload mode
          ingestUrl = API_URL === "/api"
            ? "/api/ingest-folder"
            : `${API_URL}/api/ingest-folder`;
          requestBody = {
            files: folderData.files,
            folderName: folderData.folderName,
            projectId: currentProjectId ?? undefined,
          };
          addLog(`Uploading ${folderData.files.length} files from folder: ${folderData.folderName}`);
        } else {
          // Git repo mode
          ingestUrl = API_URL === "/api"
            ? "/api/ingest"
            : `${API_URL}/api/ingest`;
          requestBody = {
            repoUrl,
            projectId: currentProjectId ?? undefined,
          };
        }
        addLog(`Sending POST request to ${ingestUrl}...`);
        if (currentProjectId) {
          addLog(`Using project ${currentProjectId.slice(0, 8)}...`);
        }
        const startTime = Date.now();

        // Large repos return multi‑MB JSON; allow headroom for graph + transfer + proxy.
        const INGEST_TIMEOUT_MS = 15 * 60 * 1000;
        const timeoutId = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(ingestUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Wait for animation to complete
        await animationPromise;

        if (cancelled) return;

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        addLog(`Server response received in ${duration}s`);

        if (!response.ok) {
          // Clone response to read body multiple times if needed
          const responseClone = response.clone();
          let errorBody: any = {};
          try {
            errorBody = await response.json();
          } catch {
            // If JSON parsing fails, try reading as text from clone
            try {
              const text = await responseClone.text();
              errorBody = {
                error: `Server error (${response.status})`,
                detail: response.statusText || text || "Unknown error",
                url: ingestUrl,
              };
            } catch {
              // If both fail, use status text only
              errorBody = {
                error: `Server error (${response.status})`,
                detail: response.statusText || "Unknown error",
                url: ingestUrl,
              };
            }
          }
          // Add URL to error for debugging
          if (!errorBody.url) {
            errorBody.url = ingestUrl;
          }

          // Handle FastAPI error format (detail can be object or string)
          let errorMsg = errorBody.error || `Server error (${response.status})`;
          let errorDetail = "";

          if (errorBody.detail) {
            if (typeof errorBody.detail === "string") {
              errorDetail = errorBody.detail;
            } else if (typeof errorBody.detail === "object") {
              errorMsg = errorBody.detail.error || errorMsg;
              errorDetail = errorBody.detail.detail || "";
            }
          }

          // Add helpful message for 404 errors
          if (response.status === 404) {
            if (API_URL === "/api") {
              errorMsg = "API endpoint not found (404)";
              errorDetail = `The frontend is trying to use the proxy (${ingestUrl}), but this only works in development. In production, you need to set VITE_API_URL=https://repo-reel-backend.fly.dev in your Netlify environment variables.`;
            } else {
              errorDetail = `Endpoint ${ingestUrl} returned 404. Check that the backend is running and the URL is correct.`;
            }
          }

          const error = new Error(errorMsg);
          (error as any).detail = errorDetail;
          (error as any).errorBody = errorBody;
          (error as any).code = errorBody.code || "";
          (error as any).url = ingestUrl;
          throw error;
        }

        const payload = await response.json();

        // Store ingested content (with error handling for quota limits)
        if (payload.content) {
          const contentSizeKB = (payload.content.length / 1024).toFixed(1);
          const contentSizeMB = payload.content.length / (1024 * 1024);
          addLog(`Received ${contentSizeKB} KB of repository content`);

          // Always keep content in memory for Phase 2 (same run)
          repoContent = payload.content;

          // sessionStorage is ~5–10 MB; skip writing large content to avoid QuotaExceededError
          const sessionStorageLimitBytes = 4 * 1024 * 1024; // 4 MB
          if (payload.content.length <= sessionStorageLimitBytes) {
            try {
              sessionStorage.setItem("repo-content", payload.content);
              sessionStorage.setItem("repo-url", repoUrl || payload.repoUrl || `local://${repoName}`);
            } catch (storageError: any) {
              console.warn('Failed to store in sessionStorage:', storageError);
            }
          } else {
            addLog(`Using in-memory content for this session (${contentSizeMB.toFixed(2)} MB — no sessionStorage save)`);
            try {
              sessionStorage.setItem("repo-url", repoUrl);
            } catch (e) {
              // Ignore if even URL storage fails
            }
          }
        }

        // Save Phase 1 completion to database (optional - only if columns exist)
        if (currentProjectId && user?.id && payload.content && payload.stats) {
          try {
            // Try to save Phase 1 data, but don't fail if columns don't exist
            await projectsService.update(currentProjectId, user.id, {
              repo_content: payload.content,
              ingestion_stats: {
                includedFiles: payload.stats.includedFiles || 0,
                skippedFiles: payload.stats.skippedFiles || 0,
                totalBytes: payload.stats.totalBytes || 0,
                totalBytesFormatted: payload.stats.totalBytesFormatted || '0 B',
                durationMs: payload.stats.durationMs || 0,
              },
              graph_data: payload.graphData || null,
              phase1_completed_at: new Date().toISOString(),
            } as any); // Use 'as any' to allow optional fields
            addLog("✓ Phase 1 data saved to database");
          } catch (error: any) {
            console.error('Failed to save Phase 1 data:', error);
            // If it's a column error, try without the new fields
            if (error?.code === 'PGRST204' || error?.message?.includes('column')) {
              try {
                // Fallback: only update basic fields
                await projectsService.update(currentProjectId, user.id, {
                  status: 'processing',
                });
                addLog("✓ Project status updated (some fields not available)");
              } catch (fallbackError) {
                // Ignore fallback errors
              }
            }
            // Continue even if save fails
          }
        }

        // One-time git clone per project: Studio + mini-SWE agent runs reuse this tree (no second GitHub clone).
        if (
          !isFolderMode &&
          currentProjectId &&
          repoUrl &&
          /^https?:\/\/github\.com\//i.test(repoUrl)
        ) {
          try {
            addLog("Setting up local git workspace for Studio (one-time clone)…");
            const ensureUrl =
              API_URL === "/api"
                ? "/api/repo-workspace/ensure"
                : `${API_URL}/api/repo-workspace/ensure`;
            const er = await fetch(ensureUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repoUrl,
                projectId: currentProjectId,
              }),
            });
            if (!er.ok) {
              let detail = er.statusText;
              try {
                const j = await er.json();
                detail =
                  typeof j.detail === "string"
                    ? j.detail
                    : JSON.stringify((j as { detail?: unknown }).detail ?? j);
              } catch {
                /* ignore */
              }
              addLog(
                `⚠️ Workspace cache setup failed (${er.status}): ${detail}. Agent runs will clone on demand.`,
              );
            } else {
              const ej = (await er.json()) as { status?: string };
              addLog(
                `✓ Studio workspace ready (${ej.status === "reused" ? "already cached" : "cloned"})`,
              );
            }
          } catch (werr) {
            console.warn("repo-workspace/ensure", werr);
            addLog(
              "⚠️ Workspace cache setup failed (network). Agent runs will clone on demand.",
            );
          }
        }

        setPhase1Status("complete");
        setProgress(60);
        setIngestionSnapshot({
          includedFiles: payload.stats?.includedFiles || 0,
          skippedFiles: payload.stats?.skippedFiles || 0,
          totalBytesFormatted: payload.stats?.totalBytesFormatted || "0 B",
          durationMs: payload.stats?.durationMs || 0,
          ingestionMode: payload.ingestionMode,
          resolvedBranch: payload.resolvedBranch,
        });
        addLog(`Phase 1 complete: ${payload.stats?.totalBytesFormatted || "unknown size"} processed`);
        if (payload.stats) {
          addLog(`  Files processed: ${payload.stats.includedFiles || 0} included, ${payload.stats.skippedFiles || 0} skipped`);
        }
        if (payload.ingestionMode) {
          addLog(`  Ingestion mode: ${payload.ingestionMode}${payload.resolvedBranch ? ` (${payload.resolvedBranch})` : ""}`);
        }
        // ── Read GitNexus graph data from response ──────────────────────────
        let ingestGraphData = payload?.graphData ?? null;
        setGraphData(ingestGraphData);

        if (ingestGraphData?.codegraph && currentProjectId && user?.id) {
          try {
            const uploadedAt = new Date().toISOString();
            const jsonKey = graphJsonObjectKey(currentProjectId);
            const csvKey = graphCsvObjectKey(currentProjectId);
            const prefix = graphArtifactPrefix(currentProjectId);

            const jsonBlob = new Blob([JSON.stringify(ingestGraphData.codegraph, null, 2)], {
              type: "application/json",
            });
            const csvBlob = new Blob(
              [serializeCodegraphCsvRows(ingestGraphData.codegraph.csvRows)],
              {
                type: "text/csv",
              }
            );

            const [jsonUpload, csvUpload] = await Promise.all([
              supabase.storage.from(GRAPH_BUCKET).upload(jsonKey, jsonBlob, {
                contentType: "application/json",
                upsert: true,
              }),
              supabase.storage.from(GRAPH_BUCKET).upload(csvKey, csvBlob, {
                contentType: "text/csv",
                upsert: true,
              }),
            ]);

            if (jsonUpload.error) throw jsonUpload.error;
            if (csvUpload.error) throw csvUpload.error;

            ingestGraphData = {
              ...ingestGraphData,
              codegraph: {
                ...ingestGraphData.codegraph,
                artifacts: {
                  storagePrefix: prefix,
                  jsonObjectKey: jsonKey,
                  csvObjectKey: csvKey,
                  uploadedAt,
                },
              },
            };

            setGraphData(ingestGraphData);
            addLog("✓ Stored code graph artifacts in Supabase storage");

            await projectsService.update(currentProjectId, user.id, {
              graph_data: ingestGraphData,
              graph_storage_path: prefix,
              graph_created_at: uploadedAt,
              graph_node_count:
                ingestGraphData.codegraph.stats.moduleCount ||
                ingestGraphData.nodes.length ||
                0,
            } as any);
          } catch (storageError: any) {
            addLog(
              `Warning: graph artifact upload skipped: ${
                storageError?.message || "storage unavailable"
              }`
            );
          }
        }

        if (ingestGraphData) {
          const nodeCount = ingestGraphData.nodes?.length ?? 0;
          const edgeCount = ingestGraphData.edges?.length ?? 0;
          const clusterCount = ingestGraphData.clusters?.length ?? 0;
          const pythonModules = ingestGraphData.codegraph?.stats?.moduleCount ?? 0;
          addLog(`✓ Graph indexed: ${nodeCount} nodes, ${edgeCount} edges, ${clusterCount} clusters`);
          if (pythonModules > 0) {
            addLog(`  Python graph: ${pythonModules} modules, ${ingestGraphData.codegraph?.stats?.entityCount || 0} entities`);
          }

          // Store graph data in sessionStorage for Studio access
          try {
            sessionStorage.setItem('graph-data', JSON.stringify(ingestGraphData));
          } catch {
            // Non-fatal — graph will be available in-memory for this session
          }
        } else {
          addLog("ℹ️  Graph skipped (no data returned)");
        }

      } catch (error) {
        if (cancelled) return;

        // Extract error details
        let errorMsg = "Unknown error";
        let errorDetail = "";
        let errorCode = "";

        if (error instanceof Error && error.name === "AbortError") {
          errorMsg = "Request timed out";
          errorDetail =
            "Ingestion took longer than 15 minutes and was aborted. This usually indicates a stalled backend request. Please retry.";
          addLog("ERROR: Ingestion timed out after 15 minutes.");
          addLog("  → Try a smaller repo or retry. For very large repos the server may still be working.");
        } else if (error instanceof Error) {
          errorMsg = error.message;
          // Check if error has detail attached
          if ((error as any).detail) {
            errorDetail = (error as any).detail;
          } else if ((error as any).errorBody) {
            const errorBody = (error as any).errorBody;
            errorMsg = errorBody.error || errorMsg;
            errorDetail = errorBody.detail || "";
          }
          if ((error as any).code) {
            errorCode = (error as any).code;
          } else if ((error as any).errorBody?.code) {
            errorCode = (error as any).errorBody.code;
          }
        }

        // Log detailed error
        addLog(`ERROR: Ingestion failed - ${errorMsg}`);
        if (errorDetail) {
          addLog(`  Details: ${errorDetail}`);
        }
        if (errorCode === "no_supported_source_files") {
          addLog("  Hint: the repository was reachable, but it looks like a placeholder/docs-only repo.");
          addLog("  Hint: use the repo that contains the real application source, or upload the source folder directly.");
        }
        setProcessingError({
          title: errorMsg,
          detail: errorDetail || "The ingestion process encountered an error. Please check the logs above for details.",
          code: errorCode || undefined,
        });
        // Show URL if available
        if ((error as any).url) {
          addLog(`  Attempted URL: ${(error as any).url}`);
        }
        // Show helpful message for 404 with proxy
        if (errorMsg.includes("404") && API_URL === "/api") {
          addLog("");
          addLog("💡 SOLUTION: Set VITE_API_URL in Netlify", "info");
          addLog("  1. Go to Netlify Dashboard → Site Settings → Environment Variables", "info");
          addLog("  2. Add: VITE_API_URL=https://repo-reel-backend.fly.dev", "info");
          addLog("  3. Redeploy your site", "info");
          addLog("");
        }

        // Check if it's a network/DNS error
        const errorLower = errorMsg.toLowerCase();
        const detailLower = errorDetail.toLowerCase();
        const isNetworkError = errorLower.includes("network") ||
          errorLower.includes("dns") ||
          errorLower.includes("resolve") ||
          errorLower.includes("connection") ||
          errorLower.includes("unable to access") ||
          detailLower.includes("dns") ||
          detailLower.includes("resolve") ||
          detailLower.includes("internet connection");

        if (isNetworkError) {
          addLog("");
          addLog("⚠️  Network connectivity issue detected");
          addLog("Please check:");
          addLog("  1. Your internet connection");
          addLog("  2. DNS settings (can you access github.com?)");
          addLog("  3. Firewall/VPN blocking GitHub");
          addLog("");
          addLog("You can retry after fixing network issues.");
          setPhase1Status("error");
          setProgress(0);
          // Update project status to error
          if (currentProjectId && user?.id) {
            try {
              await projectsService.update(currentProjectId, user.id, { status: 'error' });
            } catch (err) {
              console.error('Failed to update project status:', err);
            }
          }
          sessionStorage.setItem("processing-error", "true");
          return; // Stop processing on network errors
        }

        addLog("Stopping pipeline because ingestion did not produce a trustworthy repository snapshot.");
        addLog("A placeholder video would be misleading, so this run is marked as failed instead.");
        setPhase1Status("error");
        setProgress(0);
        if (currentProjectId && user?.id) {
          try {
            await projectsService.update(currentProjectId, user.id, { status: 'error' });
          } catch (err) {
            console.error('Failed to update project status:', err);
          }
        }
        sessionStorage.setItem("processing-error", "true");
        return;
      }

      if (cancelled) return;

      // ===== PHASE 2: MANIFEST =====
      setPhase2Status("running");
      addLog("--- Starting Phase 2: Manifest Generation ---");

      // Use content from memory (Phase 1), fallback to sessionStorage, then database
      if (!repoContent) {
        // Try sessionStorage first
        repoContent = sessionStorage.getItem("repo-content") || "";

        // If still empty and we have a project ID, try fetching from database
        if (!repoContent && currentProjectId && user?.id) {
          try {
            addLog("Loading repository content from database...");
            const project = await projectsService.getById(currentProjectId, user.id);
            if (project?.repo_content) {
              repoContent = project.repo_content;
              addLog("✓ Loaded content from database");
            }
          } catch (dbError) {
            console.warn('Failed to load content from database:', dbError);
            addLog("⚠️  Could not load content from database, using empty content");
          }
        }
      }

      const fileContents = parseRepoContent(repoContent);
      if (!USE_MOCK_MANIFEST && Object.keys(fileContents).length === 0) {
        addLog("ERROR: Repository parsing produced no usable source files.");
        addLog("Stopping before manifest generation because an empty evidence bundle would create a low-quality video.");
        setPhase2Status("error");
        setProgress(60);
        if (currentProjectId && user?.id) {
          try {
            await projectsService.update(currentProjectId, user.id, { status: 'error' });
          } catch (err) {
            console.error('Failed to update project status:', err);
          }
        }
        sessionStorage.setItem("processing-error", "true");
        return;
      }
      let manifestWithCode: VideoManifest;

      if (USE_MOCK_MANIFEST) {
        addLog("Using mock manifest (USE_MOCK_MANIFEST=true)");
        await animateSteps(phase2Steps, 60, 92);
        if (cancelled) return;

        addLog("Enriching mock manifest with code content...");
        manifestWithCode = enrichManifestWithCode(mockManifest, fileContents);
      } else {
        addLog(
          VIDEO_PIPELINE_V2_ENABLED
            ? "Generating manifest with the V2 evidence pipeline..."
            : "Generating manifest with Gemini AI..."
        );
        setCurrentStep(
          VIDEO_PIPELINE_V2_ENABLED
            ? "Extracting repo concepts..."
            : "Calling Gemini API..."
        );
        setProgress(65);

        try {
          addLog("Analyzing repository structure with code graph...");
          await new Promise(r => setTimeout(r, 500));
          setProgress(70);

          if (VIDEO_PIPELINE_V2_ENABLED) {
            addLog("Building deterministic evidence bundle from the downloaded repository...");
            setCurrentStep("Planning concept flow from code graph...");
            const v2Manifest = await generateManifestWithQualityPipeline(
              repoUrl,
              repoName,
              repoContent,
              fileContents,
              graphData
            );

            await new Promise(r => setTimeout(r, 500));
            setProgress(82);

            try {
              sessionStorage.setItem("video-manifest-intermediate", JSON.stringify(v2Manifest));
              addLog("✓ V2 intermediate manifest saved (safety checkpoint)");
            } catch { /* non-fatal */ }

            addLog("Attaching actual repository code to V2 scenes...");
            manifestWithCode = enrichManifestWithCode(v2Manifest, fileContents);
            manifestWithCode.quality_report = buildQualityReport(manifestWithCode, fileContents);

            if (manifestWithCode.knowledge_graph) {
              addLog(
                `✓ Repo knowledge graph built: ${manifestWithCode.knowledge_graph.summary.total_nodes} nodes, ${manifestWithCode.knowledge_graph.summary.total_edges} edges, ${manifestWithCode.knowledge_graph.summary.total_capsules} capsules`
              );
            }

            if (!manifestWithCode.quality_report?.ready_for_tts) {
              addLog("⚠️  V2 quality gate reported blockers.");
              manifestWithCode.quality_report.blockers.forEach((blocker) =>
                addLog(`  • ${blocker}`)
              );
              addLog("Keeping the evidence-backed manifest and skipping TTS instead of falling back to a whole-repo prompt.");
            } else {
              addLog("✓ V2 manifest passed evidence and sync quality gates.");
            }
          } else {
            addLog("Creating video script with Gemini AI (legacy pipeline)...");
            const geminiManifest = await generateManifestWithGemini(
              repoUrl,
              repoName,
              repoContent,
              graphData
            );

            await new Promise(r => setTimeout(r, 500));
            setProgress(85);

            try {
              sessionStorage.setItem("video-manifest-intermediate", JSON.stringify(geminiManifest));
              addLog("✓ Intermediate manifest saved (safety checkpoint)");
            } catch { /* non-fatal */ }

            addLog("Enriching manifest with actual code content...");
            manifestWithCode = enrichManifestWithCode(geminiManifest, fileContents);
            manifestWithCode.quality_report = buildQualityReport(manifestWithCode, fileContents);
            addLog("✓ Manifest generated successfully with Gemini AI!");
          }

          setProgress(92);
        } catch (error) {
          console.error('Gemini manifest generation failed:', error);
          addLog("⚠️  WARNING: Manifest generation failed, falling back to template");
          addLog(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);

          // Try to recover from intermediate save
          try {
            const intermediate = sessionStorage.getItem("video-manifest-intermediate");
            if (intermediate) {
              addLog("Attempting to recover from intermediate checkpoint...");
              manifestWithCode = enrichManifestWithCode(JSON.parse(intermediate), fileContents);
              addLog("✓ Recovered manifest from intermediate checkpoint");
            } else {
              throw new Error("No intermediate checkpoint available");
            }
          } catch {
            await animateSteps(phase2Steps, 60, 92);
            if (cancelled) return;

            // Use a minimal generic manifest (no Sous Chef / mock branding) so
            // applyDirectorsCutPattern rebuilds scenes with repo-aware narration.
            const genericFallback: VideoManifest = {
              title: `${repoName} - Code Walkthrough`,
              scenes: [],
              repo_files: Object.keys(fileContents),
            };
            addLog("Building manifest from repository structure (generic narration)...");
            manifestWithCode = applyDirectorsCutPattern(
              genericFallback,
              fileContents,
              repoName,
              graphData
            );
            // If no files were parsed, add one intro scene so we don't show empty/mock content
            if (manifestWithCode.scenes.length === 0) {
              manifestWithCode = {
                ...manifestWithCode,
                scenes: [
                  {
                    id: 1,
                    type: "intro",
                    file_path: "README",
                    highlight_lines: [1, 10],
                    narration_text: `A quick walkthrough of ${repoName}. This repository is being analyzed.`,
                    duration_seconds: 12,
                    title: `Overview: ${repoName}`,
                    code: "",
                  },
                ],
              };
            }
          }
        }
      }

      addLog(
        manifestWithCode.pipeline_version === "v2"
          ? "Finalizing evidence-backed manifest..."
          : "Applying director's cut narrative pattern..."
      );
      // Only apply when we have Gemini manifest (so we don't overwrite our fallback)
      try {
        if (
          manifestWithCode.pipeline_version !== "v2" &&
          manifestWithCode.scenes.length > 0 &&
          Object.keys(fileContents).length > 0
        ) {
          const afterCut = applyDirectorsCutPattern(
            manifestWithCode,
            fileContents,
            repoName,
            graphData
          );
          if (afterCut.scenes.length > 0) {
            manifestWithCode = afterCut;
          }
        }

        manifestWithCode.quality_report = buildQualityReport(manifestWithCode, fileContents);
        if (manifestWithCode.quality_report?.warnings?.length) {
          manifestWithCode.quality_report.warnings.slice(0, 5).forEach((warning) =>
            addLog(`⚠️  Quality warning: ${warning}`)
          );
        }

        if (cancelled) return;

        // Log scene details
        addLog(`Total scenes created: ${manifestWithCode.scenes.length}`);
        const totalDuration = manifestWithCode.scenes.reduce((sum, s) => sum + (s.duration_seconds || 15), 0);
        addLog(`Estimated video duration: ${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`);
        setManifestSnapshot({
          sceneCount: manifestWithCode.scenes.length,
          totalDurationSeconds: totalDuration,
          readyForTts: manifestWithCode.quality_report?.ready_for_tts !== false,
          title: manifestWithCode.title,
          blockerCount: manifestWithCode.quality_report?.blockers.length || 0,
          warningCount: manifestWithCode.quality_report?.warnings.length || 0,
          evidenceCoverage: manifestWithCode.quality_report?.scores.evidence_coverage || 0,
          visualSync: manifestWithCode.quality_report?.scores.visual_sync || 0,
          topBlocker: manifestWithCode.quality_report?.blockers[0],
          topWarning: manifestWithCode.quality_report?.warnings[0],
        });

        // TTS + upload audio to Supabase Storage (per-user cache for /v and Studio)
        const readyForTts = manifestWithCode.quality_report?.ready_for_tts !== false;
        if (!readyForTts) {
          addLog("Skipping TTS because the quality gate did not pass.");
          manifestWithCode.quality_report?.blockers.slice(0, 5).forEach((blocker) => {
            addLog(`  TTS blocker: ${blocker}`, "warning");
          });
        }

        if (GOOGLE_TTS_ENABLED && readyForTts && currentProjectId && user?.id && !cancelled) {
          addLog("Generating voice and uploading to storage...");
          try {
            const { audioUrls: genUrls } = await generateAllSceneAudio(manifestWithCode.scenes, "en-US-Standard-D");
            let uploaded = 0;
            for (const [sceneId, blobUrl] of genUrls) {
              if (cancelled) break;
              try {
                const res = await fetch(blobUrl);
                const blob = await res.blob();
                URL.revokeObjectURL(blobUrl);
                const path = `${currentProjectId}/${sceneId}.mp3`;
                const { error } = await supabase.storage.from("project-audio").upload(path, blob, { contentType: "audio/mpeg", upsert: true });
                if (error) {
                  addLog(`Warning: could not upload audio scene ${sceneId}: ${error.message}`);
                  continue;
                }
                const { data } = supabase.storage.from("project-audio").getPublicUrl(path);
                const scene = manifestWithCode.scenes.find((s) => s.id === sceneId);
                if (scene) {
                  scene.audioUrl = data.publicUrl;
                  uploaded++;
                }
              } catch (e) {
                addLog(`Warning: upload failed for scene ${sceneId}`);
              }
            }
            addLog(`Uploaded ${uploaded} audio files to storage`);
          } catch (e) {
            addLog(`Voice/storage skipped: ${e instanceof Error ? e.message : "error"}`);
          }
        }

        // Save to Supabase
        if (currentProjectId && user?.id) {
          addLog("Saving manifest to database...");
          try {
            // First try with all fields including optional ones
            await projectsService.update(currentProjectId, user.id, {
              status: 'ready',
              manifest: manifestWithCode,
              duration_seconds: totalDuration,
              repo_knowledge_graph: manifestWithCode.knowledge_graph || null,
              phase2_completed_at: new Date().toISOString(),
            } as any); // Use 'as any' to allow optional fields
            addLog("✓ Project saved successfully to database!");
            addLog("✓ Project is now available in your Dashboard!");
          } catch (error: any) {
            console.error('Failed to save project:', error);
            const errorMessage = error?.message || error?.error_description || 'Unknown error';
            const errorCode = error?.code || '';

            // If it's a column error, try without the optional fields
            if (errorCode === 'PGRST204' || errorMessage?.includes('column') || errorMessage?.includes('phase2_completed_at')) {
              addLog("Attempting to save without optional fields...", "info");
              try {
                // Fallback: only update essential fields
                await projectsService.update(currentProjectId, user.id, {
                  status: 'ready',
                  manifest: manifestWithCode,
                  duration_seconds: totalDuration,
                });
                addLog("✓ Project saved successfully (without optional fields)!");
                addLog("✓ Project is now available in your Dashboard!");
              } catch (fallbackError: any) {
                addLog(`WARNING: Could not update project in database`);
                addLog(`  Error: ${fallbackError?.message || errorMessage}`);
                addLog(`  → Manifest is ready and saved to session storage`);
                addLog(`  → You can still use Studio, but project won't appear in Dashboard`);
              }
            } else {
              addLog(`WARNING: Could not update project in database`);
              addLog(`  Error: ${errorMessage}`);
              if (errorCode) {
                addLog(`  Code: ${errorCode}`);
              }
              addLog(`  → Manifest is ready and saved to session storage`);
              addLog(`  → You can still use Studio, but project won't appear in Dashboard`);
            }
          }
        } else if (!currentProjectId) {
          addLog("WARNING: No project ID - skipping database save");
          addLog("  Manifest saved to session storage only");
        }

        // Also save to session storage for immediate access (with error handling)
        try {
          syncProjectWorkspaceToSession({
            id: currentProjectId,
            repo_url: repoUrl,
            manifest: manifestWithCode,
            repo_content: repoContent || null,
            graph_data: graphData,
            repo_knowledge_graph: manifestWithCode.knowledge_graph || null,
          });
        } catch (storageError: any) {
          // Handle quota exceeded gracefully
          if (storageError?.name === 'QuotaExceededError' ||
            storageError?.message?.includes('quota') ||
            storageError?.message?.includes('exceeded')) {
            addLog("⚠️  Manifest too large for sessionStorage");
            addLog("   Manifest is saved in database and will be loaded from there");
          } else {
            console.warn('Failed to store manifest in sessionStorage:', storageError);
          }
          // Still try to store smaller items
          try {
            syncProjectWorkspaceToSession({
              id: currentProjectId,
              repo_url: repoUrl,
            });
          } catch (e) {
            // Ignore if even small items fail
          }
        }

        setPhase2Status("complete");
        setProgress(100);
        addLog("Phase 2 complete: Manifest ready");
        addLog("--- All phases complete ---");
        addLog("Your video is ready! Click 'Continue to Studio' to start editing.");
      } catch (phase2Error) {
        // Catch-all for any unexpected error in Phase 2 post-processing
        console.error('Phase 2 post-processing error:', phase2Error);
        addLog(`⚠️  Non-fatal error in post-processing: ${phase2Error instanceof Error ? phase2Error.message : 'Unknown'}`);
        addLog("Manifest is still available — continuing to completion.");

        // Save whatever we have so far
        try {
          syncProjectWorkspaceToSession({
            id: currentProjectId,
            repo_url: repoUrl,
            manifest: manifestWithCode,
            repo_content: repoContent || null,
            graph_data: graphData,
            repo_knowledge_graph: manifestWithCode.knowledge_graph || null,
          });
        } catch { /* non-fatal */ }

        setPhase2Status("complete");
        setProgress(100);
        addLog("Phase 2 complete: Manifest ready (with warnings)");
        addLog("--- All phases complete ---");
        addLog("Your video is ready! Click 'Continue to Studio' to start editing.");
      }
    };

    runProcessing();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    addLog,
    isFolderMode,
    folderData,
    navigate,
    repoInputUrl,
    repoName,
    repoUrl,
    retryKey,
    requestedProjectId,
    user?.id,
  ]);

  const overallStatus: PhaseStatus =
    phase1Status === "error" ? "error" :
      phase2Status === "complete" ? "complete" :
        phase1Status === "running" || phase2Status === "running" ? "running" : "idle";
  const isActiveLoadingState =
    overallStatus === "running" || overallStatus === "idle";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.12]" />

      <div className={`relative z-10 w-full mx-auto px-4 py-8 ${isActiveLoadingState ? "max-w-3xl" : "max-w-6xl"}`}>
        <div className={`grid items-start gap-6 ${isActiveLoadingState ? "" : "lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]"}`}>
        <div className={isActiveLoadingState ? "mx-auto w-full" : ""}>
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
            </div>
            <span className="font-semibold text-lg">GitFlick</span>
          </div>
        </div>

        {/* Repository Info */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground mb-2">Processing Repository</p>
          <h2 className="text-xl font-semibold text-foreground">{repoName}</h2>
        </div>

        {/* Phase indicators */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <PhaseCard
            title="Phase 1: Ingestion"
            status={phase1Status}
          />
          <PhaseCard
            title="Phase 2: Manifest"
            status={phase2Status}
          />
        </div>

        {/* Progress Circle */}
        <div className="flex justify-center mb-6">
          <div className="relative h-28 w-28">
            <svg className="h-full w-full -rotate-90">
              <circle cx="56" cy="56" r="48" className="fill-none stroke-muted" strokeWidth="6" />
              <circle
                cx="56" cy="56" r="48"
                className="fill-none stroke-primary transition-all duration-500"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${progress * 3.02} 302`}
              />
              {/* Outer ring pulse when running — shows something is happening */}
              {overallStatus === "running" && (
                <circle
                  cx="56"
                  cy="56"
                  r="52"
                  className="fill-none stroke-primary/30 stroke-[3] animate-pulse"
                  style={{ animationDuration: "2s" }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {overallStatus === "complete" ? (
                <CheckCircle2 className="h-5 w-5 text-success mb-1" />
              ) : overallStatus === "error" ? (
                <AlertTriangle className="h-5 w-5 text-destructive mb-1" />
              ) : (
                <Loader2 className="h-5 w-5 text-primary animate-spin mb-1" />
              )}
              <span className="text-xl font-bold">{progress}%</span>
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-75 animate-pulse" style={{ animationDuration: "3s" }} />
          </div>
        </div>

        {/* Current Step — rotating messages so it doesn't look stuck */}
        <div className="text-center mb-6">
          <h3 className="text-base font-medium mb-1 flex items-center justify-center gap-2">
            {overallStatus === "complete" ? "Ready!" : currentStep || "Initializing..."}
            {overallStatus === "running" && (
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground min-h-[2.5rem] flex flex-col items-center justify-center gap-1">
            {overallStatus === "complete"
              ? "Your video is ready"
              : overallStatus === "running"
                ? LOADING_SUBTITLES[Math.floor(elapsedSeconds / 4) % LOADING_SUBTITLES.length]
                : "Preparing…"}
          </p>
          {overallStatus === "running" && elapsedSeconds > 10 && (
            <p className="text-xs text-muted-foreground/80 mt-2">
              Large repos can take 2–10 minutes — we're still working
            </p>
          )}
          {overallStatus === "running" && elapsedSeconds > 30 && (
            <p className="text-xs text-muted-foreground/70 mt-1 font-mono">
              Elapsed: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
            </p>
          )}
        </div>

        {/* Indeterminate progress bar — always moving so it feels alive */}
        {overallStatus === "running" && (
          <div className="w-full h-1 rounded-full bg-muted overflow-hidden mb-6">
            <div className="h-full w-[40%] rounded-full bg-primary/70 animate-processing-shimmer" />
          </div>
        )}

        {/* Terminal Log */}
        <div className="overflow-hidden rounded-xl gf-panel-deep">
          <div className="flex items-center gap-2 bg-white/[0.04] px-4 py-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
            </div>
            <span className="text-xs text-muted-foreground font-mono ml-2">processing.log</span>
            <span className="text-xs text-muted-foreground/50 ml-auto">{logs.length} entries</span>
          </div>
          <div className="h-48 overflow-y-auto bg-[#060e20] p-3 font-mono text-[11px] space-y-0.5 scroll-smooth">
            {logs.map((log, index) => {
              const isWarning = log.includes("WARNING") || log.includes("Warning");
              const isError = log.includes("ERROR") || log.includes("Error");
              const isSuccess = log.includes("complete") || log.includes("Complete");

              return (
                <div
                  key={index}
                  className={`${isError ? "text-destructive" :
                    isWarning ? "text-warning" :
                      isSuccess ? "text-success" :
                        index === logs.length - 1 ? "text-primary" : "text-muted-foreground"
                    }`}
                >
                  {log}
                  {index === logs.length - 1 && overallStatus === "running" && (
                    <span className="inline-block w-1.5 h-3 bg-primary ml-1 animate-pulse" />
                  )}
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        </div>

        {isActiveLoadingState && (
          <LoadingFlowCard />
        )}

        {/* Error Actions */}
        {overallStatus === "error" && (
          <div className="flex flex-col gap-3 mt-6">
            <div className="rounded-lg bg-destructive/10 p-4 shadow-[inset_0_0_0_1px_rgba(255,180,171,0.18)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-destructive mb-1">
                    {processingError?.title || "Processing Failed"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {processingError?.detail || "The ingestion process encountered an error. Please check the logs above for details."}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/")}
              >
                Go Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  // Clear error state and retry
                  sessionStorage.removeItem("processing-error");
                  // Trigger re-run by incrementing retry key
                  setRetryKey(prev => prev + 1);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Success Actions - Continue to Studio */}
        {overallStatus === "complete" && (
          <CompletionActions
            repoName={repoName}
            projectId={projectId}
            manifestSnapshot={manifestSnapshot}
          />
        )}
        </div>

        {!isActiveLoadingState && (
        <div className="space-y-6">
          <div className="rounded-xl gf-panel p-5">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-primary/80">
              Run Summary
            </div>
            <h3 className="mt-2 text-lg font-semibold">Processing summary</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatTile label="Included Files" value={`${ingestionSnapshot?.includedFiles ?? 0}`} />
              <StatTile label="Nodes" value={`${graphData?.nodes?.length ?? 0}`} />
              <StatTile label="Scenes" value={`${manifestSnapshot?.sceneCount ?? 0}`} />
              <StatTile
                label="Quality"
                value={
                  overallStatus === "error"
                    ? "Failed"
                    : manifestSnapshot
                      ? manifestSnapshot.readyForTts
                        ? "Ready"
                        : "Blocked"
                      : "Pending"
                }
              />
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-lg bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Architecture
                </div>
                <div className="mt-2 text-sm text-foreground">
                  {graphData?.summary?.architecturePattern || (overallStatus === "error" ? "Unavailable" : "Detecting")}
                </div>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Note
                </div>
                <div className="mt-2 text-sm text-foreground">
                  {manifestSnapshot?.topBlocker || manifestSnapshot?.topWarning || (overallStatus === "error"
                    ? "Retry after the ingestion issue is resolved."
                    : "No blocker detected.")}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
        </div>
      </div>
    </div>
  );
};

const LoadingFlowCard = () => (
  <div className="mt-6 rounded-xl gf-panel p-5">
    <div className="text-xs font-medium uppercase tracking-[0.16em] text-primary/80">
      What Happens Now
    </div>
    <h3 className="mt-2 text-lg font-semibold">Processing in stages</h3>
    <div className="mt-5 space-y-3">
      {[
        {
          title: "1. Ingest repo content",
          description: "Fetch files and build the initial project context.",
        },
        {
          title: "2. Build structure",
          description: "Map the codebase into graph-backed architecture signals.",
        },
        {
          title: "3. Plan the walkthrough",
          description: "Turn that structure into a clean scene plan for Studio.",
        },
      ].map((item) => (
        <div key={item.title} className="rounded-lg bg-white/[0.04] px-4 py-4">
          <div className="text-sm font-medium text-foreground">{item.title}</div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</div>
        </div>
      ))}
    </div>
  </div>
);

const StatTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-white/[0.04] px-4 py-3">
    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
    <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
  </div>
);

const InsightList = ({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) => (
  <div>
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      {title}
    </div>
    <div className="space-y-2">
      {items.length > 0 ? items.map((item) => (
        <div key={item} className="rounded-lg bg-white/[0.04] px-4 py-3 text-sm text-foreground">
          {item}
        </div>
      )) : (
        <div className="rounded-lg bg-background/20 px-4 py-3 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  </div>
);

const DeliverableRow = ({
  title,
  status,
  description,
}: {
  title: string;
  status: string;
  description: string;
}) => (
  <div className="rounded-lg bg-white/[0.04] px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="font-medium text-foreground">{title}</div>
      <div className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary shadow-[inset_0_0_0_1px_rgba(180,197,255,0.18)]">
        {status}
      </div>
    </div>
    <div className="mt-2 text-sm text-muted-foreground">{description}</div>
  </div>
);

// Completion screen with auth-aware CTA
const CompletionActions = ({
  repoName,
  projectId,
  manifestSnapshot,
}: {
  repoName: string;
  projectId?: string | null;
  manifestSnapshot: ManifestSnapshot | null;
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const isBlocked = manifestSnapshot?.readyForTts === false;

  if (isLoading) {
    return (
      <div className="flex justify-center mt-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mt-6">
      {/* Success message */}
      <div className={`${isBlocked ? "bg-warning/10 border-warning/20" : "bg-success/10 border-success/20"} border rounded-lg p-4`}>
        <div className="flex items-start gap-3">
          <Sparkles className={`h-5 w-5 shrink-0 mt-0.5 ${isBlocked ? "text-warning" : "text-success"}`} />
          <div className="flex-1">
            <h3 className={`font-medium mb-1 ${isBlocked ? "text-warning" : "text-success"}`}>
              {isBlocked ? "Draft generated with quality blockers" : "Video generated successfully"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isBlocked ? (
                <>
                  The current draft for <span className="font-medium">{repoName}</span> is viewable, but TTS and final render were stopped because the evidence checks did not pass.
                </>
              ) : (
                <>
                  Your code walkthrough video for <span className="font-medium">{repoName}</span> is ready to preview.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Auth-aware CTA */}
      {isAuthenticated ? (
        <Button
          size="lg"
          className="w-full"
          onClick={() => navigate(projectId ? `/studio?project=${projectId}` : "/studio")}
        >
          <Play className="h-4 w-4 mr-2" />
          {isBlocked ? "Open Draft in Studio" : "Continue to Studio"}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            {isBlocked
              ? "Sign in to inspect the blocked draft and rerun it from the Studio"
              : "Sign in to access the Studio and edit your video"}
          </p>
          <Button size="lg" className="w-full" asChild>
            <Link to="/login" state={{ from: '/studio' }}>
              Sign In
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Free forever • No credit card required
          </p>
        </div>
      )}

      {/* Secondary action */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => navigate("/")}
      >
        Generate Another Video
      </Button>
    </div>
  );
};

// Helper component for phase cards
const PhaseCard = ({ title, status }: { title: string; status: PhaseStatus }) => (
  <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
    <span className="text-xs font-medium">{title}</span>
    <div className="flex items-center gap-1.5">
      {status === "running" && <span className="h-2 w-2 rounded-full bg-processing animate-pulse" />}
      {status === "complete" && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
      {status === "error" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
      {status === "idle" && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
    </div>
  </div>
);

// Helper function to enrich manifest with code from ingested content
function enrichManifestWithCode(
  manifest: VideoManifest,
  fileContents: Record<string, string>
): VideoManifest {
  const repoFiles = Object.keys(fileContents);
  const resolvedRepoFiles = repoFiles.length > 0 ? repoFiles : manifest.repo_files || [];
  const normalizePath = (value: string) => value.replace(/^\.\/+/, "").replace(/^\/+/, "");
  const normalizedContents = new Map<string, string>(
    Object.entries(fileContents).map(([path, contents]) => [normalizePath(path), contents])
  );

  const lookupCode = (filePath?: string): string | undefined => {
    if (!filePath) return undefined;
    // 1) Exact match
    if (fileContents[filePath]) return fileContents[filePath];
    const normalizedPath = normalizePath(filePath);
    // 2) Normalized path
    if (normalizedContents.has(normalizedPath)) return normalizedContents.get(normalizedPath);
    // 3) Suffix match: path ends with /normalizedPath
    const suffixMatch = Object.keys(fileContents).find((path) =>
      normalizePath(path).endsWith(`/${normalizedPath}`)
    );
    if (suffixMatch) return fileContents[suffixMatch];
    // 4) Basename match: exactly one file with same basename
    const base = normalizedPath.split("/").pop() || "";
    if (base) {
      const basenameMatches = Object.keys(fileContents).filter(
        (path) => normalizePath(path).split("/").pop() === base
      );
      if (basenameMatches.length === 1) return fileContents[basenameMatches[0]];
    }
    // 5) Contains match (last resort): normalizedPath substring of key or vice versa, unique
    const containsMatches = Object.keys(fileContents).filter(
      (path) => {
        const np = normalizePath(path);
        return np.includes(normalizedPath) || normalizedPath.includes(np);
      }
    );
    if (containsMatches.length === 1) return fileContents[containsMatches[0]];
    return undefined;
  };

  return {
    ...manifest,
    repo_files: resolvedRepoFiles,
    scenes: manifest.scenes.map((scene) => {
      const actualCode = lookupCode(scene.file_path);
      const trimmedActual = actualCode?.trim();
      const trimmedExisting = scene.code?.trim();

      const usePlaceholder = !trimmedActual && !trimmedExisting;
      const code = trimmedActual
        ? actualCode
        : trimmedExisting
          ? scene.code
          : generatePlaceholderCode(scene);

      return {
        ...scene,
        code,
        ...(usePlaceholder ? { highlight_lines: [1, 5] as [number, number] } : {}),
      };
    }),
  };
}

function applyDirectorsCutPattern(
  manifest: VideoManifest,
  fileContents: Record<string, string>,
  repoName: string,
  graphData?: GitNexusGraphData | null
): VideoManifest {
  const allFiles = Object.keys(fileContents);
  if (allFiles.length === 0) {
    return manifest;
  }

  if (graphData) {
    const blueprint = buildGraphTutorialBlueprint(graphData, fileContents, repoName);
    if (blueprint) {
      if ((manifest.scenes?.length ?? 0) > 0) {
        return mergeManifestWithBlueprint(manifest, blueprint, fileContents, repoName);
      }
      return buildManifestFromBlueprint(blueprint, repoName);
    }
  }

  // Prefer Gemini's manifest when it already has a good structure (3-min explainer style)
  const hasIntro = (manifest.scenes || []).some((s) =>
    /intro|overview/i.test(String(s.type || ""))
  );
  const hasOutro = (manifest.scenes || []).some((s) =>
    /summary|outro/i.test(String(s.type || ""))
  );
  if (
    (manifest.scenes?.length ?? 0) >= 10 &&
    hasIntro &&
    hasOutro
  ) {
    return manifest;
  }

  const safeRepoName = repoName || manifest.title || "This project";
  const normalizeScenePath = (value: string) =>
    value.replace(/^\.\/+/, "").replace(/^\/+/, "");
  const sceneByPath = new Map<string, VideoScene>();
  manifest.scenes.forEach((scene) => {
    if (!scene.file_path) return;
    sceneByPath.set(scene.file_path, scene);
    sceneByPath.set(normalizeScenePath(scene.file_path), scene);
  });
  const getExistingScene = (path: string) =>
    sceneByPath.get(path) || sceneByPath.get(normalizeScenePath(path));

  const CODE_EXTENSIONS = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "py",
    "go",
    "rs",
    "java",
    "kt",
    "c",
    "h",
    "cpp",
    "hpp",
    "cs",
    "php",
    "rb",
    "swift",
    "dart",
    "sql",
    "graphql",
    "gql",
    "json",
    "yaml",
    "yml",
    "toml",
  ]);
  const DOC_EXTENSIONS = new Set(["md", "mdx"]);

  const getExtension = (path: string) => path.split(".").pop()?.toLowerCase() || "";
  const isDocFile = (path: string) =>
    DOC_EXTENSIONS.has(getExtension(path)) || /readme/i.test(path);
  const isCodeFile = (path: string) =>
    CODE_EXTENSIONS.has(getExtension(path)) || path.endsWith(".env");
  const isConfigFile = (path: string) =>
    /(\.env|config|settings|firebase|supabase|auth|policy|rules|docker|ci|deploy)/i.test(path);
  const matchesAny = (path: string, patterns: RegExp[]) =>
    patterns.some((pattern) => pattern.test(path));

  const normalizeLabel = (value: string) =>
    value
      .replace(/[_-]+/g, " ")
      .replace(/\.[^/.]+$/, "")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();

  const stripMarkdown = (text: string) => {
    const withoutFences = text.replace(/```[\s\S]*?```/g, "");
    const withoutInline = withoutFences.replace(/`[^`]+`/g, "");
    return withoutInline.replace(/[#>*_-]+/g, " ").replace(/\s+/g, " ").trim();
  };

  const summarizeDoc = (path?: string) => {
    if (!path) return "";
    const content = fileContents[path];
    if (!content) return "";
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const snippet = lines.slice(0, 6).join(" ");
    return stripMarkdown(snippet);
  };

  const entryPatterns = [
    /(^|\/)(app|main|index)\.(t|j)sx?$/i,
    /src\/pages\/index/i,
    /src\/app\//i,
    /router/i,
    /routes/i,
  ];
  const brainPatterns = [
    /ai/i,
    /agent/i,
    /prompt/i,
    /model/i,
    /llm/i,
    /embedding/i,
    /vector/i,
    /rag/i,
    /inference/i,
    /algorithm/i,
    /recommend/i,
    /classifier/i,
  ];
  const gutsPatterns = [
    /store/i,
    /state/i,
    /context/i,
    /redux/i,
    /zustand/i,
    /cache/i,
    /db/i,
    /database/i,
    /schema/i,
    /query/i,
    /service/i,
    /api/i,
    /supabase/i,
    /repository/i,
  ];
  const infraPatterns = [
    /auth/i,
    /security/i,
    /policy/i,
    /rules/i,
    /config/i,
    /env/i,
    /firebase/i,
    /supabase/i,
    /middleware/i,
    /docker/i,
    /ci/i,
    /deploy/i,
  ];

  const docFiles = allFiles.filter(isDocFile);
  const codeFiles = allFiles.filter(isCodeFile);
  const entryFiles = codeFiles.filter((path) => matchesAny(path, entryPatterns));
  const brainFiles = codeFiles.filter((path) => matchesAny(path, brainPatterns));
  const gutsFiles = codeFiles.filter((path) => matchesAny(path, gutsPatterns));
  const infraFiles = allFiles.filter(
    (path) => matchesAny(path, infraPatterns) || isConfigFile(path)
  );

  const readme = docFiles.find((path) => /readme/i.test(path)) || docFiles[0];
  const outroDoc = docFiles.find((path) => path !== readme) || readme;
  const allCodeFallback = codeFiles.length > 0 ? codeFiles : allFiles;

  const takeUnique = (
    candidates: string[],
    count: number,
    used: Set<string>,
    fallback: string[]
  ) => {
    const picked: string[] = [];
    const pickFrom = (list: string[]) => {
      for (const file of list) {
        if (picked.length >= count) break;
        if (used.has(file)) continue;
        picked.push(file);
        used.add(file);
      }
    };
    pickFrom(candidates);
    if (picked.length < count) {
      pickFrom(fallback);
    }
    return picked;
  };

  const buildHighlightLines = (path?: string) => {
    if (!path) return undefined;
    const content = fileContents[path];
    if (!content) return undefined;
    const lines = content.split("\n").length;
    const endLine = Math.min(20, Math.max(1, lines));
    return [1, endLine] as [number, number];
  };

  const buildNarration = (section: string, filePath: string) => {
    const baseName = filePath.split("/").pop() || filePath;
    const summary = summarizeDoc(filePath);
    const lower = filePath.toLowerCase();

    if (section === "hook") {
      if (isDocFile(filePath)) {
        return summary
          ? `${summary} In this tour we'll go from high-level overview into core modules, then data and infrastructure, so you see how everything fits together.`
          : `In this quick tour we'll explore how the application works from end to end. We start with the big picture, then drill into the main modules one by one, and wrap up with how it all connects.`;
      }
      return `We start at ${baseName}, the entry point that wires routing, providers, and the initial UI. From here we'll go deeper into the core logic, then the data layer, and finally the infrastructure that keeps it running.`;
    }

    if (section === "brain") {
      const focus = lower.includes("prompt")
        ? "prompt construction and how instructions are built for the model"
        : lower.includes("agent")
          ? "agent orchestration and decision flow"
          : lower.includes("model") || lower.includes("llm")
            ? "model invocation and API integration"
            : lower.includes("embedding") || lower.includes("vector")
              ? "retrieval, embeddings, and semantic search"
              : "core decision logic and algorithms";
      return `Here in ${baseName} is the intelligence layer. This file handles ${focus}. It drives the main product behavior and connects to the rest of the stack.`;
    }

    if (section === "guts") {
      const focus = lower.includes("schema") || lower.includes("db") || lower.includes("sql")
        ? "data modeling, queries, and persistence"
        : lower.includes("cache")
          ? "caching, performance, and avoiding redundant work"
          : "state, data flow, and how the UI stays in sync with the backend";
      return `The data pipeline lives in ${baseName}. It manages ${focus}. This is how the app stays fast and consistent as users interact with it.`;
    }

    if (section === "infra") {
      const focus = lower.includes("auth")
        ? "authentication, sessions, and access control"
        : lower.includes("policy") || lower.includes("rules")
          ? "security policies and permissions"
          : "configuration, environment, and deployment";
      return `In ${baseName}, we handle ${focus}. These pieces keep the application secure, configurable, and production-ready.`;
    }

    if (section === "outro") {
      return summary
        ? `${summary} That wraps up the tour: we covered the entry point, core logic, data flow, and infrastructure.`
        : `That completes the tour. We went from the high-level overview into the core modules, the data layer, and the infrastructure. You should now have a clear picture of how the pieces fit together.`;
    }

    return `Let's look at ${baseName} to understand how this piece fits into the overall architecture. It sits between the layers we've seen and ties them together.`;
  };

  const buildSceneTitle = (sectionLabel: string, filePath: string) => {
    const baseName = filePath.split("/").pop() || filePath;
    return `${sectionLabel}: ${normalizeLabel(baseName)}`;
  };

  const buildDurations = (totalSeconds: number, count: number) => {
    if (count <= 0) return [];
    const base = Math.floor(totalSeconds / count);
    const remainder = totalSeconds - base * count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  };

  const usedFiles = new Set<string>();
  const scenes: VideoScene[] = [];
  let sceneId = 1;

  const hookFiles = [
    ...(readme ? [readme] : []),
    ...takeUnique(entryFiles, 1, usedFiles, allCodeFallback),
  ].filter(Boolean);
  const hookDurations = buildDurations(30, hookFiles.length);
  hookFiles.forEach((filePath, index) => {
    const existing = getExistingScene(filePath);
    scenes.push({
      id: sceneId++,
      type: existing?.type || (index === 0 && isDocFile(filePath) ? "intro" : "entry"),
      file_path: filePath,
      highlight_lines: existing?.highlight_lines || buildHighlightLines(filePath),
      narration_text: existing?.narration_text || buildNarration("hook", filePath),
      duration_seconds: hookDurations[index] || 12,
      title: existing?.title || buildSceneTitle("Hook", filePath),
      code:
        existing?.code ||
        fileContents[filePath] ||
        generatePlaceholderCode({ file_path: filePath } as VideoScene),
    });
  });

  const brainFilesPicked = takeUnique(brainFiles, 4, usedFiles, allCodeFallback);
  const brainDurations = buildDurations(45, brainFilesPicked.length);
  brainFilesPicked.forEach((filePath, index) => {
    const existing = getExistingScene(filePath);
    scenes.push({
      id: sceneId++,
      type: existing?.type || "code",
      file_path: filePath,
      highlight_lines: existing?.highlight_lines || buildHighlightLines(filePath),
      narration_text: existing?.narration_text || buildNarration("brain", filePath),
      duration_seconds: brainDurations[index] || 11,
      title: existing?.title || buildSceneTitle("Brain", filePath),
      code:
        existing?.code ||
        fileContents[filePath] ||
        generatePlaceholderCode({ file_path: filePath } as VideoScene),
    });
  });

  const gutsFilesPicked = takeUnique(gutsFiles, 3, usedFiles, allCodeFallback);
  const gutsDurations = buildDurations(45, gutsFilesPicked.length);
  gutsFilesPicked.forEach((filePath, index) => {
    const existing = getExistingScene(filePath);
    scenes.push({
      id: sceneId++,
      type: existing?.type || "core",
      file_path: filePath,
      highlight_lines: existing?.highlight_lines || buildHighlightLines(filePath),
      narration_text: existing?.narration_text || buildNarration("guts", filePath),
      duration_seconds: gutsDurations[index] || 14,
      title: existing?.title || buildSceneTitle("Guts", filePath),
      code:
        existing?.code ||
        fileContents[filePath] ||
        generatePlaceholderCode({ file_path: filePath } as VideoScene),
    });
  });

  const infraFilesPicked = takeUnique(infraFiles, 2, usedFiles, allCodeFallback);
  const infraDurations = buildDurations(40, infraFilesPicked.length);
  infraFilesPicked.forEach((filePath, index) => {
    const existing = getExistingScene(filePath);
    scenes.push({
      id: sceneId++,
      type: existing?.type || "support",
      file_path: filePath,
      highlight_lines: existing?.highlight_lines || buildHighlightLines(filePath),
      narration_text: existing?.narration_text || buildNarration("infra", filePath),
      duration_seconds: infraDurations[index] || 18,
      title: existing?.title || buildSceneTitle("Infra", filePath),
      code:
        existing?.code ||
        fileContents[filePath] ||
        generatePlaceholderCode({ file_path: filePath } as VideoScene),
    });
  });

  if (outroDoc) {
    const existing = getExistingScene(outroDoc);
    scenes.push({
      id: sceneId++,
      type: existing?.type || "outro",
      file_path: outroDoc,
      highlight_lines: existing?.highlight_lines || buildHighlightLines(outroDoc),
      narration_text: existing?.narration_text || buildNarration("outro", outroDoc),
      duration_seconds: 20,
      title: existing?.title || buildSceneTitle("Outro", outroDoc),
      code:
        existing?.code ||
        fileContents[outroDoc] ||
        generatePlaceholderCode({ file_path: outroDoc } as VideoScene),
    });
  } else if (scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    scenes.push({
      id: sceneId++,
      type: "summary",
      file_path: lastScene.file_path,
      highlight_lines: lastScene.highlight_lines,
      narration_text: `That completes the walkthrough of the application architecture.`,
      duration_seconds: 20,
      title: `Outro: Summary`,
      code: lastScene.code,
    });
  }

  return {
    ...manifest,
    title: manifest.title || "Project Walkthrough",
    repo_files: manifest.repo_files || allFiles,
    scenes,
  };
}

// Generate placeholder code when actual code is not available
function generatePlaceholderCode(scene: VideoScene): string {
  const filePath = scene.file_path || "unknown";
  const title = scene.title || "Code Section";

  // Generate contextual placeholder based on file type
  if (filePath.endsWith(".md")) {
    return `# ${title}

${scene.narration_text?.slice(0, 200) || "Documentation content..."}

## Overview

This section covers the key aspects of the ${title.toLowerCase()}.
The implementation follows best practices for maintainability and scalability.

## Key Points

- Well-structured codebase architecture
- Clean separation of concerns  
- Comprehensive documentation
- Type-safe implementations
`;
  }

  if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
    return `// ${filePath}
// ${title}

import React from 'react';

/**
 * ${title}
 * ${scene.narration_text?.slice(0, 100) || "Component implementation"}
 */
export const Component = () => {
  // State management
  const [state, setState] = useState(initialState);
  
  // Effects and lifecycle
  useEffect(() => {
    // Initialize component
    initializeData();
    
    return () => {
      // Cleanup
    };
  }, [dependencies]);

  // Event handlers
  const handleAction = async () => {
    try {
      await performAction();
      updateState();
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="${title}" />
      <Content data={state.data} />
      <ActionButton onPress={handleAction} />
    </View>
  );
};
`;
  }

  if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
    return `// ${filePath}
// ${title}

/**
 * ${scene.narration_text?.slice(0, 100) || "Module implementation"}
 */

// Configuration
const config = {
  apiEndpoint: process.env.API_URL,
  timeout: 30000,
  retries: 3,
};

// Main functionality
export async function execute(params: ExecuteParams) {
  // Validate input
  validateParams(params);
  
  // Process data
  const processed = await processData(params.data);
  
  // Apply business logic
  const result = applyLogic(processed);
  
  // Return formatted response
  return formatResponse(result);
}

// Helper functions
function validateParams(params) {
  if (!params.data) {
    throw new Error('Missing required data');
  }
}

async function processData(data) {
  // Transform and validate data
  return transformedData;
}

function applyLogic(data) {
  // Core business logic
  return processedResult;
}

export default { execute, config };
`;
  }

  // Default placeholder
  return `// ${filePath}
// ${title}

/*
 * ${scene.narration_text?.slice(0, 150) || "Implementation details"}
 */

// Code content for: ${scene.file_path}
// This file is part of the codebase walkthrough
`;
}

export default Processing;
