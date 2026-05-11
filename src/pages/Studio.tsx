import { useEffect, useMemo, useState, useCallback, useRef, memo, type ElementType } from "react";
import AgentRunsPanel from "@/components/studio/AgentRunsPanel";
import GraphExplorer from "@/components/studio/GraphExplorer";
import RepoInvestigator from "@/components/studio/RepoInvestigator";
import { ChapterPlaylist } from "@/components/studio/ChapterPlaylist";
import type { GitNexusGraphData, ChapterManifest, VideoGenerationPlan } from "@/lib/types";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileCode,
  Sparkles,
  Share2,
  Volume2,
  Network,
  Search,
  LayoutGrid,
} from "lucide-react";
import { Player, PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { RemotionVideo } from "@/components/studio/RemotionVideo";
import { VideoControls, SceneListSidebar } from "@/components/studio/VideoControls";
import { mockManifest } from "@/data/mockManifest";
import { useHydrateManifest } from "@/hooks/useHydrateManifest";
import { useDownloadVideo } from "@/hooks/useDownloadVideo";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { projectsService } from "@/lib/db";
import type { VideoManifest } from "@/lib/types";
import { generateAllSceneAudio } from "@/lib/googleTTS";
import { GOOGLE_TTS_ENABLED, VIDEO_PIPELINE_V2_ENABLED } from "@/env";
import { syncProjectWorkspaceToSession } from "@/lib/projectSession";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { generateManifestWithGemini } from "@/lib/geminiDirector";
import { generateManifestWithQualityPipeline, buildQualityReport } from "@/lib/videoPipelineV2";
import { enrichManifestWithCode } from "@/lib/enrichManifestWithCode";
import { extractRepoNameFromSource } from "@/lib/projectSource";
import {
  buildSyncPathSelection,
  fileContentsToGitingestString,
  githubCompareApi,
  githubResolveRef,
  ingestSelectedGithubPaths,
  isGithubRepoUrl,
  loadBaselineFileContentsFromRepoContent,
  mergePartialFileContents,
} from "@/lib/repoSync";
import iconUrl from "../../icon.png";

/** Match Processing: avoid QuotaExceededError for sessionStorage repo cache. */
const SESSION_REPO_CONTENT_MAX_BYTES = 4 * 1024 * 1024;

type LoadingPhase = "idle" | "loading" | "hydrating" | "generating-voice" | "rendering" | "complete" | "error";
type WorkspaceView = "video" | "graph" | "ask" | "runs";
type SyncState = "idle" | "checking" | "updating" | "error";

interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

const formatTime = () => {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const MemoPlayer = memo(Player);

const WORKSPACE_VIEWS: Array<{
  id: WorkspaceView;
  label: string;
  description: string;
  icon: ElementType;
  accent: string;
}> = [
  {
    id: "video",
    label: "Walkthrough",
    description: "Review the generated narrative and jump scene by scene.",
    icon: Play,
    accent: "from-primary/16 via-[#18223f] to-cyan-300/8",
  },
  {
    id: "graph",
    label: "Code Graph",
    description: "Inspect structure, entry points, and dependency hotspots.",
    icon: Network,
    accent: "from-emerald-300/14 via-[#18223f] to-teal-300/8",
  },
  {
    id: "ask",
    label: "Repo Q&A",
    description: "Ask targeted questions and get file-backed answers.",
    icon: Search,
    accent: "from-indigo-300/14 via-[#18223f] to-blue-300/8",
  },
  {
    id: "runs",
    label: "Agent Ops",
    description: "Launch issue-bound sandboxes, inspect results, and approve promotion.",
    icon: Sparkles,
    accent: "from-amber-300/14 via-[#18223f] to-orange-300/8",
  },
];

const hashNarrationText = (scenes: VideoManifest["scenes"]) => {
  let hash = 2166136261;
  for (const scene of scenes) {
    const text = scene.narration_text || "";
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
  }
  return (hash >>> 0).toString(16);
};

const Studio = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectQuery = searchParams.get("project");
  const { user } = useAuth();
  const playerRef = useRef<PlayerRef>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [repoLabel, setRepoLabel] = useState("Loading...");
  const [repoUrlState, setRepoUrlState] = useState("");
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const [projectIdState, setProjectIdState] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState("Initializing...");
  const [audioUrls, setAudioUrls] = useState<Map<number, string>>(new Map());
  const [ttsProgress, setTtsProgress] = useState({ completed: 0, total: 0 });
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const ttsHashRef = useRef<string | null>(null);
  const audioUrlsRef = useRef<Map<number, string>>(new Map());

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [studioGraphData, setStudioGraphData] = useState<GitNexusGraphData | null>(null);
  const [repoContent, setRepoContent] = useState("");
  const [focusedRepoFilePath, setFocusedRepoFilePath] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const syncLockRef = useRef(false);

  // Chapter-based playlist state
  const [chapters, setChapters] = useState<ChapterManifest[]>([]);
  const [generationPlan, setGenerationPlan] = useState<VideoGenerationPlan | null>(null);
  const hasChapters = chapters.length > 1;

  // Load graph data and chapter plan from sessionStorage on mount
  useEffect(() => {
    if (projectQuery) return;

    try {
      const stored = sessionStorage.getItem('graph-data');
      if (stored) {
        setStudioGraphData(JSON.parse(stored));
      }
    } catch { /* non-fatal */ }
    try {
      const storedContent = sessionStorage.getItem("repo-content");
      if (storedContent) {
        setRepoContent(storedContent);
      }
    } catch { /* non-fatal */ }
    try {
      const storedPlan = sessionStorage.getItem("generation-plan");
      if (storedPlan) {
        const plan = JSON.parse(storedPlan) as VideoGenerationPlan;
        setGenerationPlan(plan);
        setChapters(plan.chapters);
      }
    } catch { /* non-fatal */ }
  }, [projectQuery]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const entry: LogEntry = { timestamp: formatTime(), message, type };
    setLogs(prev => [...prev, entry]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  // Load manifest from sessionStorage on mount
  const loadManifest = useCallback(async () => {
    // Prevent multiple simultaneous loads
    if (isLoadingRef.current) {
      console.log("[Studio] Already loading, skipping duplicate load");
      return;
    }

    isLoadingRef.current = true;
    setPhase("loading");
    setProgress(0);
    setLogs([]);

    addLog("Starting video preparation...", "info");
    setCurrentStep("Loading manifest...");

    // Simulate loading steps
    await new Promise(r => setTimeout(r, 300));
    setProgress(10);

    try {
      // Get project ID from URL params or session storage
      const projectIdFromStorage = sessionStorage.getItem('project-id');
      const projectId = projectQuery || projectIdFromStorage;
      if (projectId) setProjectIdState(projectId);

      let parsed: VideoManifest | null = null;
      let repoUrl = sessionStorage.getItem("repo-url") || "";
      setRepoUrlState(repoUrl);

      // Try to load from Supabase first
      if (projectId && user?.id) {
        addLog("Loading project from database...", "info");
        setCurrentStep("Fetching project data...");
        setProgress(20);

        try {
          const project = await projectsService.getById(projectId, user.id);

          if (project && project.manifest && project.status === 'ready') {
            addLog("Project found in database", "success");
            parsed = project.manifest as VideoManifest;
            repoUrl = project.repo_url;
            setRepoUrlState(project.repo_url);
            setRepoLabel(project.repo_name);
            setRepoContent(project.repo_content || sessionStorage.getItem("repo-content") || "");
            if (project.graph_data) {
              setStudioGraphData(project.graph_data as GitNexusGraphData);
            }
            syncProjectWorkspaceToSession(project);
          } else if (project && project.manifest && project.status === 'processing') {
            // Project is processing but has manifest - use it (might be from previous run)
            addLog("Project found (status: processing)", "info");
            addLog("Using manifest from database...", "info");
            parsed = project.manifest as VideoManifest;
            repoUrl = project.repo_url;
            setRepoUrlState(project.repo_url);
            setRepoLabel(project.repo_name);
            setRepoContent(project.repo_content || sessionStorage.getItem("repo-content") || "");
            if (project.graph_data) {
              setStudioGraphData(project.graph_data as GitNexusGraphData);
            }
            syncProjectWorkspaceToSession(project);
          } else if (project && project.status === 'processing') {
            // Project is processing but no manifest yet - check session storage
            addLog("Project is still processing...", "warning");
            addLog("Checking session storage for manifest...", "info");
            // Don't return yet - let it fall through to session storage check
          } else if (project && project.status === 'error') {
            addLog("Project processing failed", "error");
            addLog("Please go back and retry", "error");
            setPhase("error");
            setCurrentStep("Processing failed");
            setProgress(0);
            isLoadingRef.current = false;
            return;
          }
        } catch (error) {
          console.error("[Studio] Failed to load from database:", error);
          addLog("Could not load from database, trying session storage...", "warning");
        }
      }

      // Fallback to session storage if not found in database
      if (!parsed) {
        addLog("Checking session storage...", "info");
        const storedManifest = sessionStorage.getItem("video-manifest");

        if (storedManifest) {
          addLog("Found stored manifest, parsing...", "info");
          setCurrentStep("Parsing manifest data...");

          try {
            parsed = JSON.parse(storedManifest) as VideoManifest;
            if (!repoUrl) {
              repoUrl = sessionStorage.getItem("repo-url") || "";
            }
            setRepoUrlState(repoUrl);
            setRepoContent(sessionStorage.getItem("repo-content") || "");
          } catch (parseError) {
            console.error("[Studio] Failed to parse manifest:", parseError);
            addLog("Failed to parse manifest", "error");
            setPhase("error");
            setCurrentStep("Invalid manifest");
            setProgress(0);
            isLoadingRef.current = false;
            return;
          }
        }
      }

      // Validate manifest
      if (!parsed || !parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        addLog("No valid manifest found", "error");
        addLog("Please go back and create a new video", "error");
        setPhase("error");
        setCurrentStep("No manifest available");
        setProgress(0);
        isLoadingRef.current = false;
        return;
      }

      await new Promise(r => setTimeout(r, 300));
      setProgress(35);

      addLog(`Manifest loaded: "${parsed.title || "Untitled"}"`, "success");
      addLog(`Found ${parsed.scenes.length} scenes`, "info");

      // Set manifest state
      setManifest(parsed);
      if (!repoLabel || repoLabel === "Loading...") {
        setRepoLabel(repoUrl || parsed.title || "Video Preview");
      }
      setRepoUrlState(repoUrl);

      // Log scene details
      setCurrentStep("Analyzing scenes...");
      setProgress(45);
      await new Promise(r => setTimeout(r, 200));

      const sceneTypes = parsed.scenes.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(sceneTypes).forEach(([type, count]) => {
        addLog(`  - ${type}: ${count} scene(s)`, "info");
      });

      setProgress(55);

      // Ensure parsed is set (should be set by now)
      if (!parsed) {
        parsed = mockManifest;
        setManifest(mockManifest);
        setRepoLabel(mockManifest.title);
      }

      // Phase 2: Hydrating
      setPhase("hydrating");
      setCurrentStep("Hydrating scene data...");
      addLog("Starting scene hydration...", "info");

      await new Promise(r => setTimeout(r, 300));
      setProgress(65);

      addLog("Calculating frame timings...", "info");
      await new Promise(r => setTimeout(r, 200));
      setProgress(75);

      addLog("Mapping file paths to tree...", "info");
      await new Promise(r => setTimeout(r, 200));
      setProgress(85);

      addLog("Preparing code syntax highlighting...", "info");
      await new Promise(r => setTimeout(r, 200));
      setProgress(90);

      // Phase 3: Generating Voice (TTS) — skip if manifest has stored audio (Supabase)
      const hasStoredAudio = parsed?.scenes?.some((s) => s.audioUrl);
      if (hasStoredAudio && parsed?.scenes) {
        const stored = new Map<number, string>();
        for (const s of parsed.scenes) {
          if (s.audioUrl) stored.set(s.id, s.audioUrl);
        }
        setAudioUrls(stored);
        setTtsProgress({ completed: stored.size, total: parsed.scenes.length });
        addLog("Using stored audio from project", "info");
      } else if (GOOGLE_TTS_ENABLED && parsed && parsed.scenes && parsed.scenes.length > 0) {
        setPhase("generating-voice");
        setCurrentStep("Generating voice narration...");
        addLog("Starting voice generation with Google TTS...", "info");
        addLog(`Generating audio for ${parsed.scenes.length} scenes...`, "info");

        try {
          const narrationHash = hashNarrationText(parsed.scenes);
          if (ttsHashRef.current === narrationHash && audioUrlsRef.current.size >= parsed.scenes.length) {
            setTtsProgress({ completed: parsed.scenes.length, total: parsed.scenes.length });
            addLog("Reusing existing voice audio for this manifest", "info");
          } else {
            const { audioUrls: generatedAudioUrls, failures } = await generateAllSceneAudio(
              parsed.scenes,
              'en-US-Standard-D',
              (completed, total) => {
                setTtsProgress({ completed, total });
                const ttsPercent = Math.floor((completed / total) * 100);
                setProgress(90 + Math.floor(ttsPercent * 0.05)); // 90-95% for TTS
                addLog(`Processed voice for scene ${completed}/${total}`, completed === total ? "success" : "info");
              }
            );

            setAudioUrls((prev) => {
              prev.forEach((url) => URL.revokeObjectURL(url));
              return generatedAudioUrls;
            });
            ttsHashRef.current = narrationHash;
            addLog(`✓ Voice generation complete! Generated ${generatedAudioUrls.size} audio files`, "success");
            if (failures.length > 0) {
              addLog(`⚠️ ${failures.length} scene(s) failed TTS generation`, "warning");
              const firstFailure = failures[0];
              addLog(`First TTS error (scene ${firstFailure.sceneId}): ${firstFailure.error}`, "warning");
            }
          }
        } catch (error) {
          console.error("TTS generation failed:", error);
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          addLog("⚠️ Voice generation failed, continuing without audio", "warning");
          addLog(`Error: ${errorMsg}`, "warning");

          // Provide helpful guidance based on error type
          if (errorMsg.includes('API key') || errorMsg.includes('blocked') || errorMsg.includes('403')) {
            addLog("", "info");
            addLog("💡 To fix TTS:", "info");
            addLog("  1. Get a Google Cloud TTS API key from:", "info");
            addLog("     https://console.cloud.google.com/apis/credentials", "info");
            addLog("  2. Enable the Text-to-Speech API in Google Cloud Console", "info");
            addLog("  3. Add VITE_GOOGLE_TTS_API_KEY to your .env file", "info");
            addLog("  4. Restart your dev server", "info");
            addLog("", "info");
          } else if (errorMsg.includes('proxy') || errorMsg.includes('404')) {
            addLog("", "info");
            addLog("💡 TTS proxy not available - using direct API", "info");
            addLog("  Make sure VITE_GOOGLE_TTS_API_KEY is set in .env", "info");
            addLog("", "info");
          }

          // Continue without audio - video will still work
          setAudioUrls((prev) => {
            prev.forEach((url) => URL.revokeObjectURL(url));
            return new Map();
          });
        }
      } else {
        if (!GOOGLE_TTS_ENABLED) {
          addLog("Google TTS not enabled, skipping voice generation", "info");
        }
      }

      // Phase 4: Rendering
      setPhase("rendering");
      setCurrentStep("Initializing Remotion player...");
      addLog("Setting up video renderer...", "info");

      await new Promise(r => setTimeout(r, 300));
      setProgress(95);

      addLog("Configuring player controls...", "info");
      await new Promise(r => setTimeout(r, 200));

      setProgress(100);

      // Ensure we have a valid manifest - use parsed or fallback to mock
      const finalManifest = parsed || mockManifest;

      if (!finalManifest || !finalManifest.scenes || finalManifest.scenes.length === 0) {
        // Last resort - use mock
        console.warn("[Studio] No valid manifest at all, using mock");
        setManifest(mockManifest);
        setRepoLabel(mockManifest.title);
        addLog("Using demo manifest", "warning");
      } else {
        // Ensure manifest state is set
        setManifest(finalManifest);
        addLog(`Manifest: ${finalManifest.scenes.length} scenes`, "info");
      }

      setPhase("complete");
      setCurrentStep("Ready to play!");
      addLog("Video player ready!", "success");
      addLog("Click play to start the walkthrough", "info");
      isLoadingRef.current = false;

    } catch (e) {
      isLoadingRef.current = false;
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      console.error("Failed to load manifest:", e);
      addLog(`Error: ${errorMsg}`, "error");

      // Check if it's a critical error (invalid manifest structure)
      if (errorMsg.includes("no scenes") || errorMsg.includes("invalid")) {
        addLog("Manifest is invalid or corrupted", "error");
        addLog("Please go back and regenerate the video", "error");
        setPhase("error");
        setCurrentStep("Invalid manifest");
        setProgress(0);
        return;
      }

      // For other errors, try fallback
      addLog("Falling back to demo content...", "warning");

      try {
        setManifest(mockManifest);
        setRepoLabel(mockManifest.title);
        setPhase("complete");
        setProgress(100);
        setCurrentStep("Ready (using demo)");
      } catch (fallbackError) {
        // Even fallback failed - show error
        addLog("Failed to load demo content", "error");
        setPhase("error");
        setCurrentStep("Failed to load");
        setProgress(0);
      }
    }
  }, [addLog, projectQuery, repoLabel, user?.id]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  // When we have projectId (e.g. from sessionStorage) but URL has no ?project=, replace URL so it's shareable
  useEffect(() => {
    if (!projectIdState || phase !== "complete") return;
    if (projectQuery === projectIdState) return;
    const next = new URLSearchParams(searchParams);
    next.set("project", projectIdState);
    setSearchParams(next, { replace: true });
  }, [phase, projectIdState, projectQuery, searchParams, setSearchParams]);

  const hydratedManifest = useHydrateManifest(manifest, 30, audioUrls);

  // Fallback to mock manifest if we have no manifest at all
  const fallbackHydratedManifest = useHydrateManifest(
    !manifest ? mockManifest : null,
    30,
    audioUrls
  );

  // Always ensure we have a hydrated manifest - use mock if needed
  const mockHydratedManifest = useHydrateManifest(mockManifest, 30, audioUrls);

  const effectiveHydratedManifest = hydratedManifest || fallbackHydratedManifest || mockHydratedManifest;
  /** Bumps when Git sync finishes or manifest narrative changes — Remotion must remount to pick up new composition reliably. */
  const playerCompositionKey = useMemo(() => {
    if (!manifest?.scenes?.length) return "no-manifest";
    const snap = manifest.source_snapshot?.commit_sha ?? "no-snap";
    return `${snap}-${hashNarrationText(manifest.scenes)}`;
  }, [manifest]);
  const durationInFrames = Math.max(1, effectiveHydratedManifest?.totalFrames ?? 1);
  const playerStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      backgroundColor: "#020617",
      borderRadius: "16px",
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(15,23,42,0.08), 0 18px 40px rgba(15,23,42,0.18)",
    }),
    []
  );

  const { downloadVideo, isExporting: isDownloadingVideo } = useDownloadVideo({
    playerContainerRef,
    playerRef,
    totalFrames: durationInFrames,
    fps: 30,
    fileName: repoLabel || "video",
  });

  const inputProps = useMemo(
    () => {
      // Always ensure we have a valid manifest - use mock if needed
      const finalManifest = effectiveHydratedManifest || mockHydratedManifest;

      if (!finalManifest) {
        console.warn("[Studio] No hydrated manifest available at all", {
          manifest: !!manifest,
          hydratedManifest: !!hydratedManifest,
          fallbackHydratedManifest: !!fallbackHydratedManifest,
          mockHydratedManifest: !!mockHydratedManifest
        });
        return null;
      }
      if (!finalManifest.scenes || finalManifest.scenes.length === 0) {
        console.warn("[Studio] Hydrated manifest has no scenes", { finalManifest });
        return null;
      }
      console.log("[Studio] Creating inputProps", {
        scenes: finalManifest.scenes.length,
        totalFrames: finalManifest.totalFrames,
        usingFallback: !hydratedManifest && !!fallbackHydratedManifest,
        usingMock: !effectiveHydratedManifest && !!mockHydratedManifest
      });
      return { manifest: finalManifest };
    },
    [effectiveHydratedManifest, fallbackHydratedManifest, hydratedManifest, manifest, mockHydratedManifest]
  );

  // Player event handlers
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      setCurrentFrame(e.detail.frame);
    };

    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    player.addEventListener("frameupdate", handleFrameUpdate as EventListener);

    return () => {
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("frameupdate", handleFrameUpdate as EventListener);
    };
  }, [phase]);

  // After sync (or any manifest swap), jump to frame 0 so controls match the new composition.
  useEffect(() => {
    if (phase !== "complete") return;
    const id = requestAnimationFrame(() => {
      playerRef.current?.seekTo(0);
      setCurrentFrame(0);
    });
    return () => cancelAnimationFrame(id);
  }, [playerCompositionKey, phase]);

  // Control visibility on mouse movement
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Player control functions
  const handlePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying]);

  const handleSeek = useCallback((frame: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(frame);
    setCurrentFrame(frame);
  }, []);

  const handleSceneClick = useCallback((sceneIndex: number, frame: number) => {
    handleSeek(frame);
  }, [handleSeek]);

  const isGithubSyncEligible = useMemo(
    () => isGithubRepoUrl(repoUrlState || ""),
    [repoUrlState]
  );

  const syncTooltip = useMemo(() => {
    if (!isGithubSyncEligible) return "GitHub repos only";
    if (syncState === "checking") return "Checking GitHub HEAD…";
    if (syncState === "updating") return "Syncing changed files…";
    return "Sync from GitHub";
  }, [isGithubSyncEligible, syncState]);

  const replaceAudioUrls = useCallback((next: Map<number, string>) => {
    setAudioUrls((prev) => {
      prev.forEach((url) => {
        try {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
      return next;
    });
  }, []);

  const handleSyncFromGithub = useCallback(async () => {
    if (!manifest || !isGithubSyncEligible || syncState !== "idle") return;
    if (syncLockRef.current) return;
    syncLockRef.current = true;

    try {
      setSyncState("checking");
      const snapshot = manifest.source_snapshot;
      const baselineSha = snapshot?.commit_sha || null;
      const baselineBranch = snapshot?.branch || null;
      const repoUrl = (repoUrlState || snapshot?.repo_url || "").trim();

      if (!repoUrl) throw new Error("Missing repository URL for sync");

      const head = await githubResolveRef(repoUrl, baselineBranch);

      if (baselineSha && baselineSha === head.sha) {
        toast({ title: "Already up to date", description: "No GitHub changes since the pinned snapshot." });
        setSyncState("idle");
        return;
      }

      let workingRepoContent = repoContent;
      let baselineMap = loadBaselineFileContentsFromRepoContent(workingRepoContent);
      if (Object.keys(baselineMap).length === 0 && projectIdState && user?.id) {
        try {
          const projectRow = await projectsService.getById(projectIdState, user.id);
          if (projectRow?.repo_content) {
            workingRepoContent = projectRow.repo_content;
            baselineMap = loadBaselineFileContentsFromRepoContent(workingRepoContent);
            setRepoContent(workingRepoContent);
          }
        } catch {
          /* non-fatal */
        }
      }

      if (!baselineSha || Object.keys(baselineMap).length === 0) {
        const refreshed = {
          ...manifest,
          source_snapshot: {
            repo_url: repoUrl,
            branch: head.branch,
            commit_sha: head.sha,
            pinned_at: new Date().toISOString(),
          },
        };
        setManifest(refreshed);
        syncProjectWorkspaceToSession({
          id: projectIdState,
          repo_url: repoUrl,
          manifest: refreshed,
          repo_content: repoContent || null,
          graph_data: studioGraphData,
          repo_knowledge_graph: refreshed.knowledge_graph || null,
        });
        if (projectIdState && user?.id) {
          await projectsService.update(projectIdState, user.id, { manifest: refreshed });
        }
        toast({ title: "Pinned current HEAD", description: "Baseline snapshot was missing, so HEAD was pinned." });
        setSyncState("idle");
        return;
      }

      setSyncState("updating");
      const compare = await githubCompareApi(repoUrl, baselineSha, head.sha);
      const pathsToRefresh = buildSyncPathSelection(compare, manifest, studioGraphData);

      if (pathsToRefresh.length === 0) {
        const refreshed = {
          ...manifest,
          source_snapshot: {
            repo_url: repoUrl,
            branch: head.branch,
            commit_sha: head.sha,
            pinned_at: new Date().toISOString(),
          },
        };
        setManifest(refreshed);
        toast({ title: "Snapshot updated", description: "No code paths needed refresh for this compare." });
        setSyncState("idle");
        return;
      }

      const partial = await ingestSelectedGithubPaths({
        repoUrl,
        branch: head.branch,
        paths: pathsToRefresh,
      });

      const mergedFiles = mergePartialFileContents(baselineMap, partial.files, partial.removed);
      const mergedRepoContent = fileContentsToGitingestString(mergedFiles);
      const repoName = extractRepoNameFromSource(repoUrl || repoLabel || manifest.title || "Repository");

      let nextManifest: VideoManifest;
      if (VIDEO_PIPELINE_V2_ENABLED) {
        const v2 = await generateManifestWithQualityPipeline(
          repoUrl,
          repoName,
          mergedRepoContent,
          mergedFiles,
          studioGraphData
        );
        nextManifest = enrichManifestWithCode(v2, mergedFiles);
        nextManifest.quality_report = buildQualityReport(nextManifest, mergedFiles);
      } else {
        const legacy = await generateManifestWithGemini(
          repoUrl,
          repoName,
          mergedRepoContent,
          studioGraphData
        );
        nextManifest = enrichManifestWithCode(legacy, mergedFiles);
        nextManifest.quality_report = buildQualityReport(nextManifest, mergedFiles);
      }

      nextManifest.source_snapshot = {
        repo_url: repoUrl,
        branch: partial.branch || head.branch,
        commit_sha: partial.resolvedCommitSha || head.sha,
        pinned_at: new Date().toISOString(),
      };

      ttsHashRef.current = null;

      if (nextManifest.quality_report?.ready_for_tts === false) {
        replaceAudioUrls(new Map());
      } else if (GOOGLE_TTS_ENABLED) {
        try {
          const { audioUrls: genUrls } = await generateAllSceneAudio(nextManifest.scenes, "en-US-Standard-D");
          const nextAudio = new Map<number, string>();
          for (const [sceneId, blobUrl] of genUrls) {
            if (!projectIdState || !user?.id) {
              nextAudio.set(sceneId, blobUrl);
              continue;
            }
            try {
              const res = await fetch(blobUrl);
              const blob = await res.blob();
              URL.revokeObjectURL(blobUrl);
              const path = `${projectIdState}/${sceneId}.mp3`;
              const { error } = await supabase.storage
                .from("project-audio")
                .upload(path, blob, { contentType: "audio/mpeg", upsert: true });
              if (error) {
                nextAudio.set(sceneId, blobUrl);
                continue;
              }
              const { data } = supabase.storage.from("project-audio").getPublicUrl(path);
              const scene = nextManifest.scenes.find((s) => s.id === sceneId);
              if (scene) scene.audioUrl = data.publicUrl;
              nextAudio.set(sceneId, data.publicUrl);
            } catch {
              nextAudio.set(sceneId, blobUrl);
            }
          }
          replaceAudioUrls(nextAudio);
        } catch {
          replaceAudioUrls(new Map());
        }
      } else {
        replaceAudioUrls(new Map());
      }

      const totalDuration = nextManifest.scenes.reduce((sum, s) => sum + (s.duration_seconds || 15), 0);
      if (projectIdState && user?.id) {
        await projectsService.update(projectIdState, user.id, {
          status: "ready",
          manifest: nextManifest,
          duration_seconds: totalDuration,
          repo_content: mergedRepoContent,
          graph_data: studioGraphData,
          repo_knowledge_graph: nextManifest.knowledge_graph || null,
          phase2_completed_at: new Date().toISOString(),
        });
      }

      setManifest(nextManifest);
      setRepoContent(mergedRepoContent);
      const repoForSession =
        mergedRepoContent.length <= SESSION_REPO_CONTENT_MAX_BYTES ? mergedRepoContent : null;
      syncProjectWorkspaceToSession({
        id: projectIdState,
        repo_url: repoUrl,
        manifest: nextManifest,
        repo_content: repoForSession,
        graph_data: studioGraphData,
        repo_knowledge_graph: nextManifest.knowledge_graph || null,
      });

      toast({
        title: "Video synced",
        description: `Refreshed ${Object.keys(partial.files).length} changed file(s) and rebuilt the walkthrough.`,
      });
      setSyncState("idle");
    } catch (error) {
      setSyncState("error");
      const message = error instanceof Error ? error.message : "Sync failed";
      toast({ title: "Sync failed", description: message, variant: "destructive" });
      setSyncState("idle");
    } finally {
      syncLockRef.current = false;
    }
  }, [
    manifest,
    isGithubSyncEligible,
    syncState,
    repoUrlState,
    repoContent,
    projectIdState,
    user?.id,
    studioGraphData,
    repoLabel,
    replaceAudioUrls,
  ]);

  // Debug logging
  useEffect(() => {
    if (phase === "complete") {
      console.log("[Studio] Phase complete state:", {
        manifest: !!manifest,
        manifestScenes: manifest?.scenes?.length,
        hydratedManifest: !!hydratedManifest,
        hydratedScenes: hydratedManifest?.scenes?.length,
        effectiveHydratedManifest: !!effectiveHydratedManifest,
        effectiveScenes: effectiveHydratedManifest?.scenes?.length,
        inputProps: !!inputProps,
        durationInFrames,
        canRender: phase === "complete" && !!inputProps && !!effectiveHydratedManifest && (effectiveHydratedManifest?.scenes?.length ?? 0) > 0,
      });

      // If we're complete but can't render, log why
      if (phase === "complete" && (!inputProps || !effectiveHydratedManifest)) {
        console.error("[Studio] Cannot render player:", {
          hasManifest: !!manifest,
          hasHydratedManifest: !!hydratedManifest,
          hasEffectiveHydratedManifest: !!effectiveHydratedManifest,
          hasInputProps: !!inputProps,
          manifestScenes: manifest?.scenes?.length,
          hydratedScenes: hydratedManifest?.scenes?.length,
          effectiveScenes: effectiveHydratedManifest?.scenes?.length,
        });
      }
    }
  }, [phase, manifest, hydratedManifest, effectiveHydratedManifest, inputProps, durationInFrames]);

  // Calculate total duration for display
  const totalDuration = useMemo(() => {
    if (hydratedManifest) {
      const totalSeconds = hydratedManifest.totalFrames / hydratedManifest.fps;
      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.floor(totalSeconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    if (!manifest?.scenes) return "0:00";
    const totalSeconds = manifest.scenes.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0
    );
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [hydratedManifest, manifest]);

  // Current scene index
  const currentSceneIndex = useMemo(() => {
    if (!effectiveHydratedManifest?.scenes) return 0;
    const index = effectiveHydratedManifest.scenes.findIndex(
      (scene) => currentFrame >= scene.startFrame && currentFrame < scene.endFrame
    );
    return index === -1 ? 0 : index;
  }, [effectiveHydratedManifest, currentFrame]);

  // Active chapter index — derived from currentFrame and chapter boundaries
  const activeChapterIndex = useMemo(() => {
    if (!hasChapters || !effectiveHydratedManifest?.scenes) return 0;
    const readyChapters = chapters.filter((ch) => ch.status === "ready" && ch.manifest);
    let cursor = 0;
    for (let i = 0; i < readyChapters.length; i++) {
      const ch = readyChapters[i];
      const chDuration = ch.manifest?.scenes.reduce(
        (sum, s) => sum + (s.duration_seconds || 15),
        0
      ) ?? 0;
      const endFrame = cursor + chDuration * 30;
      if (currentFrame < endFrame) return i;
      cursor = endFrame;
    }
    return readyChapters.length - 1;
  }, [hasChapters, chapters, currentFrame, effectiveHydratedManifest]);

  const handleSeekToChapter = useCallback(
    (chapterIndex: number, frame: number) => {
      handleSeek(frame);
    },
    [handleSeek]
  );

  const activeSceneFilePath =
    effectiveHydratedManifest?.scenes?.[currentSceneIndex]?.file_path;
  const workspaceView: WorkspaceView = (() => {
    const view = searchParams.get("view");
    return view === "graph" || view === "ask" || view === "video" || view === "runs" ? view : "video";
  })();
  const highlightedRepoFilePath = focusedRepoFilePath || activeSceneFilePath;

  const evidenceBundle = manifest?.evidence_bundle;
  const knowledgeGraph = manifest?.knowledge_graph;
  const qualityReport = manifest?.quality_report;
  const setWorkspaceView = useCallback((view: WorkspaceView) => {
    const next = new URLSearchParams(searchParams);
    next.set("view", view);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (workspaceView !== "video" && isVideoFullscreen) {
      setIsVideoFullscreen(false);
    }
  }, [workspaceView, isVideoFullscreen]);

  const focusRepoFile = useCallback((filePath: string) => {
    setFocusedRepoFilePath(filePath);
    setWorkspaceView("graph");
  }, [setWorkspaceView]);

  const isLoading = phase !== "complete" && phase !== "error";

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          handlePlayPause();
          break;
        case "f":
          if (workspaceView === "video") {
            e.preventDefault();
            setIsVideoFullscreen((prev) => !prev);
          }
          break;
        case "escape":
          if (isVideoFullscreen) {
            e.preventDefault();
            setIsVideoFullscreen(false);
          }
          break;
        case "arrowleft":
          handleSeek(Math.max(0, currentFrame - 30 * 5)); // 5 seconds back
          break;
        case "arrowright":
          handleSeek(Math.min(durationInFrames - 1, currentFrame + 30 * 5)); // 5 seconds forward
          break;
        case "m":
          // Toggle mute handled by VideoControls
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause, handleSeek, currentFrame, durationInFrames, workspaceView, isVideoFullscreen]);

  // Copy share link (unique /v/:id when project is from DB)
  const handleShare = useCallback(() => {
    const projectId = projectIdState || projectQuery;
    const url = projectId ? `${window.location.origin}/v/${projectId}` : window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Video link has been copied to clipboard.",
    });
  }, [projectIdState, projectQuery]);

  const LoadingScreen = () => (
    <div className="mx-auto max-w-3xl">
      <div className="premium-card p-8">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-xl blur-xl opacity-50 animate-pulse" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent">
              <img src={iconUrl} alt="GitFlick" className="h-8 w-8 object-contain" />
            </div>
          </div>
          <div>
            <div className="text-sm font-medium gradient-text">Preparing Studio</div>
            <h2 className="mt-1 text-2xl font-bold text-foreground">{repoLabel}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {phase === "generating-voice"
                ? "Generating voice tracks for the walkthrough."
                : "Loading the project and getting the player ready."}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-4">
          <PhaseCard
            icon={FileCode}
            title="Load"
            status={phase === "loading" ? "running" : progress >= 55 ? "complete" : "idle"}
          />
          <PhaseCard
            icon={Sparkles}
            title="Hydrate"
            status={phase === "hydrating" ? "running" : progress >= 90 ? "complete" : "idle"}
          />
          <PhaseCard
            icon={Volume2}
            title="Voice"
            status={
              phase === "generating-voice"
                ? "running"
                : progress >= 95
                  ? "complete"
                  : "idle"
            }
          />
          <PhaseCard
            icon={Play}
            title="Render"
            status={phase === "rendering" ? "running" : phase === "complete" ? "complete" : "idle"}
          />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-white/52">
            <span>{currentStep || "Preparing studio..."}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {phase === "generating-voice" && ttsProgress.total > 0 && (
          <div className="mt-4 rounded-[18px] bg-white/[0.04] px-4 py-3 text-sm text-white/56 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            Voice generation: scene {ttsProgress.completed} of {ttsProgress.total}
          </div>
        )}

        <div className="mt-5 rounded-[18px] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/34">
            Recent Activity
          </div>
          <div className="mt-3 space-y-2 font-mono text-xs">
            {logs.slice(-6).map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className={log.type === "error"
                  ? "text-rose-200"
                  : log.type === "warning"
                    ? "text-amber-200"
                    : log.type === "success"
                      ? "text-emerald-200"
                      : "text-white/58"}
              >
                [{log.timestamp}] {log.message}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {progress > 50 && phase !== "complete" && (
          <div className="mt-6 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPhase("complete");
                setProgress(100);
                addLog("Skipped to player", "warning");
              }}
            >
              Skip to player
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <div className="flex min-h-screen">
        <StudioSidebar
          repoLabel={repoLabel}
          activeView={workspaceView}
          onChangeView={setWorkspaceView}
        />

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-30 glass border-b border-white/[0.08]">
            <div className="flex flex-col gap-3 px-6 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                <Link to="/dashboard" className="btn-ghost p-2">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <div className="text-lg font-bold gradient-text">{repoLabel}</div>
                  <div className="text-sm text-muted-foreground">
                    {manifest?.scenes?.length || 0} scenes • {totalDuration}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-subtle flex items-center gap-2" onClick={loadManifest}>
                  <RefreshCw className="h-4 w-4" />
                  <span>Reload</span>
                </button>
                <button className="btn-subtle flex items-center gap-2" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                  <span>Share</span>
                </button>
                <button
                  className="btn-premium flex items-center gap-2"
                  onClick={() => navigate(projectIdState ? `/export?project=${projectIdState}` : "/export")}
                >
                  <Download className="h-4 w-4" />
                  <span>Export</span>
                </button>
              </div>
            </div>
          </header>

          <main className="w-full px-5 py-5">
            <StudioWorkspaceTabs
              activeView={workspaceView}
              onChange={setWorkspaceView}
            />

            <div className="mt-5">
              {isLoading ? (
                <LoadingScreen />
              ) : phase === "error" ? (
                <div className="rounded-[24px] border border-rose-300/18 bg-[#151d38] p-6 shadow-[0_18px_44px_rgba(2,6,23,0.28)]">
                  <AlertTriangle className="h-10 w-10 text-rose-300" />
                  <h2 className="mt-4 text-2xl font-semibold text-white">Studio failed to load</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">
                    {currentStep || "The project manifest could not be loaded for this studio session."}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button variant="outline" asChild>
                      <Link to="/dashboard">Back to dashboard</Link>
                    </Button>
                    <Button onClick={loadManifest}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {workspaceView === "video" && (
              <section
                className={cn(
                  "grid gap-5",
                  isVideoFullscreen
                    ? "fixed inset-0 z-50 bg-[#081227] p-4 lg:grid-cols-[minmax(0,80%)_minmax(260px,20%)]"
                    : "xl:grid-cols-[minmax(0,1fr)_300px]",
                )}
              >
                <section className="rounded-[22px] gf-panel p-3 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
                  <div
                    className="relative"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => isPlaying && setShowControls(false)}
                  >
                    <div ref={playerContainerRef} className="relative w-full">
                      {inputProps && effectiveHydratedManifest && effectiveHydratedManifest.scenes?.length > 0 ? (
                        <div className="relative group w-full">
                          <div
                            className="relative w-full"
                            style={{
                              aspectRatio: "16 / 9",
                              maxWidth: "100%",
                              minHeight: "420px",
                            }}
                          >
                            <MemoPlayer
                              key={playerCompositionKey}
                              ref={playerRef}
                              component={RemotionVideo}
                              inputProps={inputProps}
                              durationInFrames={effectiveHydratedManifest.totalFrames || durationInFrames}
                              compositionWidth={1920}
                              compositionHeight={1080}
                              fps={30}
                              style={playerStyle}
                              controls={false}
                              autoPlay={false}
                              loop={false}
                              clickToPlay
                              doubleClickToFullscreen
                              spaceKeyToPlayOrPause
                              acknowledgeRemotionLicense
                            />

                            <div
                              className={`absolute inset-0 overflow-hidden rounded-2xl transition-opacity duration-300 ${
                                showControls
                                  ? "pointer-events-auto opacity-100"
                                  : "pointer-events-none opacity-0"
                              }`}
                            >
                              <VideoControls
                                playerRef={playerRef}
                                manifest={effectiveHydratedManifest}
                                isPlaying={isPlaying}
                                isFullscreen={isVideoFullscreen}
                                currentFrame={currentFrame}
                                totalFrames={effectiveHydratedManifest.totalFrames || durationInFrames}
                                fps={30}
                                onPlayPause={handlePlayPause}
                                onSeek={handleSeek}
                                onToggleFullscreen={() => setIsVideoFullscreen((prev) => !prev)}
                                onSceneChange={(idx) => console.log("Scene changed:", idx)}
                                onDownloadVideo={downloadVideo}
                                isDownloadingVideo={isDownloadingVideo}
                                showSync={isGithubSyncEligible}
                                onSync={handleSyncFromGithub}
                                isSyncing={syncState === "checking" || syncState === "updating"}
                                syncDisabled={syncState !== "idle" || !manifest}
                                syncTooltip={syncTooltip}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-[460px] items-center justify-center rounded-[22px] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                          <div className="max-w-md px-6 text-center">
                            <AlertTriangle className="mx-auto h-12 w-12 text-amber-300" />
                            <h2 className="mt-4 text-xl font-semibold text-white">Player not ready</h2>
                            <p className="mt-2 text-sm leading-6 text-white/56">
                              The video manifest loaded, but the player could not be prepared yet.
                            </p>
                            <div className="mt-5 flex justify-center gap-3">
                              <Button variant="outline" asChild>
                                <Link to="/dashboard">Back</Link>
                              </Button>
                              <Button onClick={loadManifest}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Retry
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {effectiveHydratedManifest && (
                  <aside className="overflow-hidden rounded-[22px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
                    {hasChapters ? (
                      <div className="max-h-[720px] overflow-y-auto">
                        <ChapterPlaylist
                          chapters={chapters}
                          masterIndex={generationPlan?.master_index}
                          currentFrame={currentFrame}
                          fps={30}
                          onSeekToChapter={handleSeekToChapter}
                          activeChapterIndex={activeChapterIndex}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="px-4 py-3.5">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/34">
                            Scenes
                          </div>
                          <div className="mt-1 text-sm text-white/56">
                            Jump to a part of the walkthrough without leaving the page.
                          </div>
                        </div>
                        <div className="max-h-[720px] overflow-y-auto">
                          <SceneListSidebar
                            manifest={effectiveHydratedManifest}
                            currentSceneIndex={currentSceneIndex}
                            onSceneClick={handleSceneClick}
                            fps={30}
                          />
                        </div>
                      </>
                    )}
                  </aside>
                )}
              </section>
                  )}

                  {workspaceView === "graph" && (
              <section id="studio-code-graph" className="min-h-[680px]">
                {studioGraphData ? (
                  <GraphExplorer
                    graphData={studioGraphData}
                    activeFilePath={highlightedRepoFilePath}
                    onNodeClick={(node) => setFocusedRepoFilePath(node.filePath)}
                  />
                ) : (
                  <div className="rounded-[22px] gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
                    <div className="text-sm font-medium text-primary">Code Graph</div>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      Graph data is not available for this session
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/56">
                      The project manifest loaded, but the raw graph payload was
                      not present in the current session. Re-running processing
                      will rebuild the graph view.
                    </p>
                  </div>
                )}
              </section>
                  )}

                  {workspaceView === "ask" && (
              <RepoInvestigator
                repoName={repoLabel}
                repoContent={repoContent}
                manifest={manifest}
                graphData={studioGraphData}
                onFocusFile={focusRepoFile}
              />
                  )}

                  {workspaceView === "runs" && (
              <AgentRunsPanel
                repoUrl={repoUrlState}
                repoName={repoLabel}
                projectId={projectIdState}
                manifest={manifest}
                graphData={studioGraphData}
                onFocusFile={focusRepoFile}
              />
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

const StudioSidebar = ({
  repoLabel,
  activeView,
  onChangeView,
}: {
  repoLabel: string;
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
}) => (
  <aside className="hidden lg:flex lg:flex-col w-64 glass border-r border-white/[0.08]">
    <div className="p-6">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-xl blur-lg opacity-60" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent">
            <img src={iconUrl} alt="GitFlick" className="h-7 w-7 object-contain" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-bold gradient-text">GitFlick</div>
          <div className="truncate text-xs text-muted-foreground">{repoLabel}</div>
        </div>
      </div>
    </div>

    <div className="px-4 pb-4">
      <div className="glass rounded-xl p-3">
        <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </div>
        <div className="space-y-1">
          {WORKSPACE_VIEWS.map((view) => {
            const isActive = view.id === activeView;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => onChangeView(view.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-gradient-to-r from-primary/20 to-accent/20 text-white shadow-lg shadow-primary/10"
                    : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                )}
              >
                <view.icon className="h-4 w-4 shrink-0" />
                <span>{view.label}</span>
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>

    <div className="flex-1" />

    <div className="px-6 py-4 text-xs text-muted-foreground/60">
      Premium Studio Experience
    </div>
  </aside>
);

const StudioWorkspaceTabs = ({
  activeView,
  onChange,
}: {
  activeView: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}) => (
  <section className="premium-card px-6 py-4">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Workspace Views
      </div>

      <div className="flex flex-wrap gap-2">
        {WORKSPACE_VIEWS.map((view) => {
          const isActive = view.id === activeView;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onChange(view.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/20"
                  : "glass hover:bg-white/[0.08] text-muted-foreground hover:text-foreground",
              )}
            >
              <view.icon className="h-4 w-4" />
              {view.label}
            </button>
          );
        })}
      </div>
    </div>
  </section>
);

// Phase Card Component
const PhaseCard = ({
  icon: Icon,
  title,
  status
}: {
  icon: ElementType;
  title: string;
  status: "idle" | "running" | "complete" | "error";
}) => (
  <div className={`
    flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-all duration-300
    ${status === "running" ? "border-primary/30 bg-primary/12" :
      status === "complete" ? "border-emerald-300/18 bg-emerald-300/10" :
        "border-white/8 bg-white/[0.04]"}
  `}>
    <div className="flex items-center gap-2">
      <Icon className={`h-3.5 w-3.5 ${status === "running" ? "text-primary animate-pulse" :
          status === "complete" ? "text-emerald-200" :
            "text-white/36"
        }`} />
      <span className="text-xs font-medium text-white/74">{title}</span>
    </div>
    <div className="flex items-center gap-1">
      {status === "running" && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      )}
      {status === "complete" && (
        <CheckCircle2 className="h-3 w-3 text-emerald-200" />
      )}
      {status === "idle" && (
        <span className="h-1.5 w-1.5 rounded-full bg-white/24" />
      )}
    </div>
  </div>
);

export default Studio;
