import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { 
  ArrowLeft, 
  Download, 
  Home, 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  FileCode,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  Share2,
  Volume2,
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
import type { VideoManifest } from "@/lib/geminiDirector";
import { generateAllSceneAudio } from "@/lib/googleTTS";
import { GOOGLE_TTS_ENABLED } from "@/env";
import iconUrl from "../../icon.png";

type LoadingPhase = "idle" | "loading" | "hydrating" | "generating-voice" | "rendering" | "complete" | "error";

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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const playerRef = useRef<PlayerRef>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [repoLabel, setRepoLabel] = useState("Loading...");
  const [phase, setPhase] = useState<LoadingPhase>("idle");
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
  const [showSidebar, setShowSidebar] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      const projectIdFromUrl = searchParams.get('project');
      const projectIdFromStorage = sessionStorage.getItem('project-id');
      const projectId = projectIdFromUrl || projectIdFromStorage;

      let parsed: VideoManifest | null = null;
      let repoUrl = sessionStorage.getItem("repo-url") || "";

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
            setRepoLabel(project.repo_name);
            
            // Update session storage for compatibility
            sessionStorage.setItem("video-manifest", JSON.stringify(parsed));
            sessionStorage.setItem("repo-url", repoUrl);
            sessionStorage.setItem("project-id", project.id);
          } else if (project && project.manifest && project.status === 'processing') {
            // Project is processing but has manifest - use it (might be from previous run)
            addLog("Project found (status: processing)", "info");
            addLog("Using manifest from database...", "info");
            parsed = project.manifest as VideoManifest;
            repoUrl = project.repo_url;
            setRepoLabel(project.repo_name);
            
            // Update session storage for compatibility
            sessionStorage.setItem("video-manifest", JSON.stringify(parsed));
            sessionStorage.setItem("repo-url", repoUrl);
            sessionStorage.setItem("project-id", project.id);
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
  }, [addLog, user?.id, searchParams]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

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
  const durationInFrames = Math.max(1, effectiveHydratedManifest?.totalFrames ?? 1);
  const playerStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      backgroundColor: "#0a0a0f",
      borderRadius: "16px",
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 25px 50px -12px rgba(0, 0, 0, 0.8)",
    }),
    []
  );

  const { downloadVideo, isExporting: isDownloadingVideo, statusMessage: downloadStatusMessage } = useDownloadVideo({
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
    [effectiveHydratedManifest, hydratedManifest, fallbackHydratedManifest, mockHydratedManifest]
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
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
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
  }, [handlePlayPause, handleSeek, currentFrame, durationInFrames]);

  // Copy share link (unique /v/:id when project is from DB)
  const handleShare = useCallback(() => {
    const projectId = sessionStorage.getItem("project-id") || searchParams.get("project");
    const url = projectId ? `${window.location.origin}/v/${projectId}` : window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Video link has been copied to clipboard.",
    });
  }, [searchParams]);

  // Loading Screen Component
  const LoadingScreen = () => (
    <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute inset-0 bg-radial-gradient" />

      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute font-mono text-xs text-primary animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${8 + Math.random() * 4}s`,
            }}
          >
            {["</>", "{}", "()", "[]", "//", "=>"][Math.floor(Math.random() * 6)]}
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto px-4">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/10 border border-primary/20 shadow-lg shadow-primary/10">
              <img src={iconUrl} alt="GitFlick" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <span className="font-bold text-xl block bg-gradient-to-r from-white to-white/80 bg-clip-text">GitFlick</span>
              <span className="text-xs text-muted-foreground">Video Studio</span>
            </div>
          </div>
        </div>

        {/* Repository Info */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground mb-2">Preparing Video</p>
          <h2 className="text-lg font-semibold text-foreground truncate max-w-md mx-auto">
            {repoLabel}
          </h2>
        </div>

        {/* Phase indicators */}
        <div className="grid grid-cols-4 gap-2 mb-6">
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
            status={phase === "generating-voice" ? "running" : progress >= 95 ? "complete" : progress >= 90 ? "idle" : "idle"} 
          />
          <PhaseCard 
            icon={Play}
            title="Render" 
            status={phase === "rendering" ? "running" : phase === "complete" ? "complete" : "idle"} 
          />
        </div>

        {/* Progress Circle */}
        <div className="flex justify-center mb-6">
          <div className="relative h-32 w-32">
            <svg className="h-full w-full -rotate-90">
              <circle cx="64" cy="64" r="56" className="fill-none stroke-muted" strokeWidth="6" />
              <circle
                cx="64" cy="64" r="56"
                className="fill-none stroke-primary transition-all duration-300"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${progress * 3.52} 352`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {phase === "complete" ? (
                <CheckCircle2 className="h-6 w-6 text-success mb-1" />
              ) : phase === "error" ? (
                <AlertTriangle className="h-6 w-6 text-destructive mb-1" />
              ) : (
                <Loader2 className="h-6 w-6 text-primary animate-spin mb-1" />
              )}
              <span className="text-2xl font-bold">{progress}%</span>
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-75 -z-10" />
          </div>
        </div>

        {/* TTS Generation Animation */}
        {phase === "generating-voice" && ttsProgress.total > 0 && (
          <div className="mb-6 space-y-4">
            {/* Voice Icon with Pulse */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-purple-500/10 border-2 border-primary/30">
                  <Volume2 className="h-10 w-10 text-primary animate-pulse" />
                </div>
              </div>
            </div>

            {/* Scene Progress */}
            <div className="text-center">
              <p className="text-sm font-medium text-primary mb-2">
                Generating voice for scene {ttsProgress.completed}/{ttsProgress.total}
              </p>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-300 ease-out"
                  style={{ width: `${(ttsProgress.completed / ttsProgress.total) * 100}%` }}
                />
              </div>
            </div>

            {/* Sound Wave Bars */}
            <div className="flex items-end justify-center gap-1.5 h-12">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 bg-gradient-to-t from-primary to-purple-500 rounded-full"
                  style={{
                    animation: `sound-wave ${0.4 + i * 0.1}s ease-in-out infinite`,
                    animationDelay: `${i * 0.1}s`,
                    minHeight: '8px',
                    maxHeight: '48px',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Current Step */}
        <div className="text-center mb-6">
          <h3 className="text-base font-medium mb-1">{currentStep}</h3>
          <p className="text-sm text-muted-foreground">
            {phase === "complete" ? "Click anywhere on the video to play" : 
             phase === "generating-voice" ? "Creating professional voice narration..." :
             "Building your code walkthrough..."}
          </p>
        </div>

        {/* Terminal Log */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 px-4 py-2 bg-secondary/50 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
            </div>
            <span className="text-xs text-muted-foreground font-mono ml-2">studio.log</span>
          </div>
          <div className="p-3 h-40 overflow-y-auto font-mono text-xs space-y-1 bg-black/20">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`flex gap-2 ${
                  log.type === "error" ? "text-destructive" :
                  log.type === "warning" ? "text-warning" :
                  log.type === "success" ? "text-success" :
                  index === logs.length - 1 ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="text-muted-foreground/50 select-none">[{log.timestamp}]</span>
                <span>{log.message}</span>
                {index === logs.length - 1 && isLoading && (
                  <span className="inline-block w-1.5 h-3 bg-primary ml-1 animate-pulse" />
                )}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Skip Button (only show after some progress) */}
        {progress > 50 && phase !== "complete" && (
          <div className="flex justify-center mt-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setPhase("complete");
                setProgress(100);
                addLog("Skipped to player", "warning");
              }}
            >
              Skip to Player
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Loading Overlay */}
      {isLoading && <LoadingScreen />}

      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/80 backdrop-blur-sm shrink-0 z-40">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/10 border border-primary/20">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6 object-contain" />
            </div>
            <div>
              <span className="font-medium text-sm truncate max-w-[300px] block">
                {repoLabel}
              </span>
              <span className="text-xs text-muted-foreground">
                {manifest?.scenes?.length || 0} scenes • {totalDuration}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={loadManifest}
            title="Reload manifest"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            title="Share"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
          >
            {showSidebar ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link to="/">
              <Home className="h-3.5 w-3.5" />
              New Video
            </Link>
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={downloadVideo}
            disabled={phase !== "complete" || isDownloadingVideo}
            title={downloadStatusMessage || undefined}
          >
            {isDownloadingVideo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {isDownloadingVideo ? "Exporting…" : "Download"}
          </Button>
          <Button size="sm" className="gap-2" onClick={() => navigate("/export")}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="flex-1 flex overflow-hidden min-h-0"
        style={{ height: "calc(100vh - 56px)" }}
      >
        {/* Video Player Area */}
        <div 
          className="flex-1 min-w-0 flex items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black relative"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => isPlaying && setShowControls(false)}
          style={{ minHeight: 0 }}
        >
          <div 
            ref={playerContainerRef}
            className="relative w-full h-full flex items-center justify-center p-6"
            style={{ minHeight: 0 }}
          >
            {phase === "complete" && inputProps && effectiveHydratedManifest && effectiveHydratedManifest.scenes?.length > 0 && (
              <div 
                className="relative group w-full h-full flex items-center justify-center"
                style={{ 
                  maxWidth: showSidebar
                    ? "min(1400px, calc(100vw - 360px))"
                    : "min(1400px, 100vw)",
                  maxHeight: "100%",
                }}
              >
                <div 
                  className="relative w-full"
                  style={{ 
                    aspectRatio: '16 / 9',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    minHeight: '400px',
                  }}
                >
                    <MemoPlayer
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
                
                  {/* Custom Video Controls */}
                  <div className={`absolute inset-0 transition-opacity duration-300 rounded-2xl overflow-hidden ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                    <VideoControls
                      playerRef={playerRef}
                      manifest={effectiveHydratedManifest}
                      isPlaying={isPlaying}
                      currentFrame={currentFrame}
                      totalFrames={effectiveHydratedManifest.totalFrames || durationInFrames}
                      fps={30}
                      onPlayPause={handlePlayPause}
                      onSeek={handleSeek}
                      onSceneChange={(idx) => console.log("Scene changed:", idx)}
                      onDownloadVideo={downloadVideo}
                      isDownloadingVideo={isDownloadingVideo}
                    />
                  </div>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/95">
                <div className="text-center max-w-md px-6">
                  <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-6" />
                  <h2 className="text-2xl font-semibold mb-2">Failed to Load Video</h2>
                  <p className="text-muted-foreground mb-2">
                    {currentStep || "An error occurred while loading the video manifest."}
                  </p>
                  <p className="text-sm text-muted-foreground mb-6">
                    This usually happens when the ingestion process failed or the manifest is invalid.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      <Home className="h-4 w-4 mr-2" />
                      Go Home
                    </Button>
                    <Button onClick={loadManifest}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!isLoading && phase === "complete" && (!effectiveHydratedManifest || !effectiveHydratedManifest.scenes?.length) && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/95">
                <div className="text-center max-w-md px-6">
                  <AlertTriangle className="h-16 w-16 text-warning mx-auto mb-6" />
                  <h2 className="text-2xl font-semibold mb-2">Player Not Ready</h2>
                  <p className="text-muted-foreground mb-4">
                    The video manifest could not be loaded properly.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      <Home className="h-4 w-4 mr-2" />
                      Go Home
                    </Button>
                    <Button onClick={loadManifest}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Scene List */}
        {showSidebar && phase === "complete" && effectiveHydratedManifest && (
          <aside className="w-80 shrink-0 border-l border-border bg-card/50 backdrop-blur-sm h-full overflow-y-auto">
            <SceneListSidebar
              manifest={effectiveHydratedManifest}
              currentSceneIndex={currentSceneIndex}
              onSceneClick={handleSceneClick}
              fps={30}
            />
          </aside>
        )}
      </main>
    </div>
  );
};

// Phase Card Component
const PhaseCard = ({ 
  icon: Icon, 
  title, 
  status 
}: { 
  icon: React.ElementType;
  title: string; 
  status: "idle" | "running" | "complete" | "error";
}) => (
  <div className={`
    flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-all duration-300
    ${status === "running" ? "border-primary/50 bg-primary/5" : 
      status === "complete" ? "border-success/50 bg-success/5" : 
      "border-border bg-card/50"}
  `}>
    <div className="flex items-center gap-2">
      <Icon className={`h-3.5 w-3.5 ${
        status === "running" ? "text-primary animate-pulse" :
        status === "complete" ? "text-success" :
        "text-muted-foreground"
      }`} />
      <span className="text-xs font-medium">{title}</span>
    </div>
    <div className="flex items-center gap-1">
      {status === "running" && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      )}
      {status === "complete" && (
        <CheckCircle2 className="h-3 w-3 text-success" />
      )}
      {status === "idle" && (
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      )}
    </div>
  </div>
);

export default Studio;
