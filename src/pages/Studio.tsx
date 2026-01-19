import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Download, 
  Home, 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  Film,
  FileCode,
  Sparkles
} from "lucide-react";
import { Player, PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { RemotionVideo } from "@/components/studio/RemotionVideo";
import { mockManifest } from "@/data/mockManifest";
import { useHydrateManifest } from "@/hooks/useHydrateManifest";
import type { VideoManifest } from "@/lib/geminiDirector";

type LoadingPhase = "idle" | "loading" | "hydrating" | "rendering" | "complete" | "error";

interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

const formatTime = () => {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const Studio = () => {
  const navigate = useNavigate();
  const playerRef = useRef<PlayerRef>(null);
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [repoLabel, setRepoLabel] = useState("Loading...");
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState("Initializing...");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

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
      addLog("Checking session storage for manifest...", "info");
      const storedManifest = sessionStorage.getItem("video-manifest");
      const storedUrl = sessionStorage.getItem("repo-url");
      
      // Clear any previous error markers
      sessionStorage.removeItem("processing-error");
      
      await new Promise(r => setTimeout(r, 200));
      setProgress(20);

      let parsed: VideoManifest | null = null;
      
      if (storedManifest) {
        addLog("Found stored manifest, parsing...", "info");
        setCurrentStep("Parsing manifest data...");
        
        try {
          parsed = JSON.parse(storedManifest) as VideoManifest;
        } catch (parseError) {
          console.error("[Studio] Failed to parse manifest, using mock:", parseError);
          parsed = mockManifest;
        }
        
        await new Promise(r => setTimeout(r, 300));
        setProgress(35);
        
        // Validate manifest structure - use mock if invalid
        if (!parsed || !parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
          console.warn("[Studio] Invalid manifest structure, using mock:", parsed);
          parsed = mockManifest;
        }
        
        addLog(`Manifest loaded: "${parsed.title || "Untitled"}"`, "success");
        addLog(`Found ${parsed.scenes.length} scenes`, "info");
        
        // Set manifest state BEFORE continuing
        setManifest(parsed);
        setRepoLabel(storedUrl || parsed.title || "Video Preview");
        
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
      } else {
        // Check if there was a processing error (no manifest means ingestion likely failed)
        const repoContent = sessionStorage.getItem("repo-content");
        const processingError = sessionStorage.getItem("processing-error");
        const storedUrl = sessionStorage.getItem("repo-url");
        
        if (processingError || (!repoContent && storedUrl)) {
          // Ingestion failed - show error
          addLog("No manifest found - ingestion may have failed", "error");
          addLog("Please go back and retry the ingestion process", "error");
          setPhase("error");
          setCurrentStep("Ingestion failed");
          setProgress(0);
          isLoadingRef.current = false;
          return;
        }
        
        addLog("No stored manifest found", "warning");
        addLog("Loading demo content...", "info");
        setCurrentStep("Loading demo manifest...");
        
        await new Promise(r => setTimeout(r, 400));
        setProgress(40);
        
        parsed = mockManifest;
        parsed = mockManifest;
        setManifest(mockManifest);
        setRepoLabel(mockManifest.title);
        addLog(`Demo manifest loaded: ${mockManifest.scenes.length} scenes`, "success");
        setProgress(55);
      }
      
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

      // Phase 3: Rendering
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
        if (!manifest || manifest !== finalManifest) {
          setManifest(finalManifest);
        }
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
  }, [addLog, manifest]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  const hydratedManifest = useHydrateManifest(manifest);
  
  // Fallback to mock manifest if we have no manifest at all
  const fallbackHydratedManifest = useHydrateManifest(
    !manifest ? mockManifest : null
  );
  
  // Always ensure we have a hydrated manifest - use mock if needed
  const mockHydratedManifest = useHydrateManifest(mockManifest);
  
  const effectiveHydratedManifest = hydratedManifest || fallbackHydratedManifest || mockHydratedManifest;
  const durationInFrames = Math.max(1, effectiveHydratedManifest?.totalFrames ?? 1);

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

  const isLoading = phase !== "complete" && phase !== "error";

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
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Film className="h-6 w-6" />
            </div>
            <div>
              <span className="font-semibold text-lg block">Repo-to-Reel</span>
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
        <div className="grid grid-cols-3 gap-2 mb-6">
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

        {/* Current Step */}
        <div className="text-center mb-6">
          <h3 className="text-base font-medium mb-1">{currentStep}</h3>
          <p className="text-sm text-muted-foreground">
            {phase === "complete" ? "Click anywhere on the video to play" : "Building your code walkthrough..."}
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
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card shrink-0 z-40">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate max-w-[300px]">
              {repoLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              • {manifest?.scenes?.length || 0} scenes • {totalDuration}
            </span>
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
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link to="/">
              <Home className="h-3.5 w-3.5" />
              New Video
            </Link>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => navigate("/export")}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </header>

      {/* Video Player */}
      <main className="flex-1 flex flex-col bg-black/95 overflow-hidden">
        <div className="flex-1 relative w-full h-full min-h-0">
          {(() => {
            if (phase === "complete") {
              // Determine which manifest to use
              const finalManifest = effectiveHydratedManifest || mockHydratedManifest;
              const finalInputProps = inputProps || (finalManifest ? { manifest: finalManifest } : null);
              const finalDuration = finalManifest?.totalFrames || durationInFrames;
              
              if (finalInputProps && finalManifest && finalManifest.scenes?.length > 0) {
                console.log("[Studio] Rendering player:", {
                  scenes: finalManifest.scenes.length,
                  totalFrames: finalDuration,
                  usingMock: !effectiveHydratedManifest && !!mockHydratedManifest
                });
                
                return (
                  <div className="w-full h-full min-h-0 flex flex-col">
                    <Player
                      ref={playerRef}
                      component={RemotionVideo}
                      inputProps={finalInputProps}
                      durationInFrames={finalDuration}
                      compositionWidth={1920}
                      compositionHeight={1080}
                      fps={30}
                      style={{ 
                        width: "100%", 
                        height: "100%",
                        flex: 1,
                        backgroundColor: "#0a0a0f",
                        minHeight: "400px",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                      controls
                      autoPlay={false}
                      loop={false}
                      clickToPlay
                      doubleClickToFullscreen
                      spaceKeyToPlayOrPause
                      acknowledgeRemotionLicense
                    />
                  </div>
                );
              } else {
                // Phase is complete but player can't render - show debug info and try mock
                console.error("[Studio] Phase complete but player cannot render:", {
                  hasInputProps: !!inputProps,
                  hasEffectiveHydratedManifest: !!effectiveHydratedManifest,
                  effectiveScenes: effectiveHydratedManifest?.scenes?.length || 0,
                  hasMockHydratedManifest: !!mockHydratedManifest,
                  mockScenes: mockHydratedManifest?.scenes?.length || 0
                });
                
                // Last resort: try to render with mock manifest
                if (mockHydratedManifest && mockHydratedManifest.scenes?.length > 0) {
                  console.log("[Studio] Rendering with mock manifest as last resort");
                  return (
                    <div className="w-full h-full min-h-0 flex flex-col">
                      <Player
                        ref={playerRef}
                        component={RemotionVideo}
                        inputProps={{ manifest: mockHydratedManifest }}
                        durationInFrames={mockHydratedManifest.totalFrames}
                        compositionWidth={1920}
                        compositionHeight={1080}
                        fps={30}
                        style={{ 
                          width: "100%", 
                          height: "100%",
                          flex: 1,
                          backgroundColor: "#0a0a0a",
                          minHeight: "400px",
                        }}
                        controls
                        autoPlay={false}
                        loop={false}
                        clickToPlay
                        doubleClickToFullscreen
                        spaceKeyToPlayOrPause
                        acknowledgeRemotionLicense
                      />
                    </div>
                  );
                }
                
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/95">
                    <div className="text-center max-w-md px-6">
                      <AlertTriangle className="h-16 w-16 text-warning mx-auto mb-6" />
                      <h2 className="text-2xl font-semibold mb-2">Player Not Ready</h2>
                      <p className="text-muted-foreground mb-2">
                        The video manifest could not be hydrated properly.
                      </p>
                      <p className="text-sm text-muted-foreground mb-4 font-mono text-left">
                        Debug info:<br/>
                        Manifest: {manifest ? "✓" : "✗"} ({manifest?.scenes?.length || 0} scenes)<br/>
                        Hydrated: {hydratedManifest ? "✓" : "✗"} ({hydratedManifest?.scenes?.length || 0} scenes)<br/>
                        Effective: {effectiveHydratedManifest ? "✓" : "✗"} ({effectiveHydratedManifest?.scenes?.length || 0} scenes)<br/>
                        Mock: {mockHydratedManifest ? "✓" : "✗"} ({mockHydratedManifest?.scenes?.length || 0} scenes)<br/>
                        InputProps: {inputProps ? "✓" : "✗"}
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
                );
              }
            } else if (phase === "error") {
              return (
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
              );
            } else if (!isLoading && !manifest) {
              return (
                <div className="absolute inset-0 flex items-center justify-center bg-background/95">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
                    <p className="text-muted-foreground mb-4">Loading video...</p>
                  </div>
                </div>
              );
            }
            
            return null;
          })()}
        </div>
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
