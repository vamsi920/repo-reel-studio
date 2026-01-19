import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockManifest } from "@/data/mockManifest";
import { useAuth } from "@/context/AuthContext";
import { projectsService, extractRepoName } from "@/lib/db";
import { generateManifestWithGemini } from "@/lib/geminiDirector";
import { USE_MOCK_MANIFEST } from "@/env";
import { toast } from "@/hooks/use-toast";
import type { VideoManifest, VideoScene } from "@/lib/types";
import iconUrl from "../../icon.png";

const phase1Steps = [
  { text: "Initializing ingestion pipeline...", duration: 400 },
  { text: "Connecting to ingestion server (port 8787)...", duration: 500 },
  { text: "Validating repository URL...", duration: 300 },
  { text: "Cloning repository with git...", duration: 1500 },
  { text: "Walking folder tree structure...", duration: 600 },
  { text: "Filtering source files (ts, tsx, js, jsx, md)...", duration: 500 },
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

type PhaseStatus = "idle" | "running" | "complete" | "error";

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
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);
  
  const addLog = useCallback((message: string) => {
    const timestamp = formatTime();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(`[PROCESSING] ${message}`);
  }, []);

  const repoUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const encodedRepo = params.get("repo") || "";
    return encodedRepo ? decodeURIComponent(encodedRepo) : "";
  }, [location.search]);

  const repoName = useMemo(() => {
    try {
      const url = new URL(repoUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : repoUrl;
    } catch {
      return repoUrl || "Unknown Repository";
    }
  }, [repoUrl]);

  useEffect(() => {
    if (!repoUrl) {
      setPhase1Status("error");
      addLog("ERROR: Missing repository URL. Please go back and enter a URL.");
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
          addLog("Creating project in database...");
          const repoNameFromUrl = extractRepoName(repoUrl);
          const project = await projectsService.create({
            user_id: user.id,
            repo_url: repoUrl,
            repo_name: repoNameFromUrl,
            title: `${repoNameFromUrl} - Video Walkthrough`,
            status: 'processing',
            manifest: null,
            duration_seconds: null,
          });
          currentProjectId = project.id;
          setProjectId(project.id);
          sessionStorage.setItem('project-id', project.id);
          addLog(`✓ Project created successfully: ${project.id.substring(0, 8)}...`);
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
      const animationPromise = animateSteps(phase1Steps, 5, 55);

      // Run actual ingestion
      try {
        addLog("Sending POST request to /api/ingest...");
        const startTime = Date.now();
        
        const response = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl }),
          signal: controller.signal,
        });

        // Wait for animation to complete
        await animationPromise;

        if (cancelled) return;

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        addLog(`Server response received in ${duration}s`);

        if (!response.ok) {
          let errorBody: any = {};
          try {
            errorBody = await response.json();
          } catch {
            // If JSON parsing fails, use status text
            errorBody = { error: `Server error (${response.status})`, detail: response.statusText };
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
          
          const error = new Error(errorMsg);
          (error as any).detail = errorDetail;
          (error as any).errorBody = errorBody;
          throw error;
        }

        const payload = await response.json();
        
        // Store ingested content (with error handling for quota limits)
        if (payload.content) {
          const contentSize = (payload.content.length / 1024).toFixed(1);
          addLog(`Received ${contentSize} KB of repository content`);
          
          // Store content in memory variable (for Phase 2)
          repoContent = payload.content;
          
          // Try to store in sessionStorage, but don't fail if quota is exceeded
          try {
            sessionStorage.setItem("repo-content", payload.content);
            sessionStorage.setItem("repo-url", repoUrl);
          } catch (storageError: any) {
            // Handle quota exceeded or other storage errors gracefully
            if (storageError?.name === 'QuotaExceededError' || 
                storageError?.message?.includes('quota') ||
                storageError?.message?.includes('exceeded')) {
              const sizeMB = (payload.content.length / (1024 * 1024)).toFixed(2);
              addLog(`⚠️  Content too large (${sizeMB} MB) for sessionStorage, skipping local storage`);
              addLog(`   Content will be used from memory and saved to database`);
            } else {
              console.warn('Failed to store in sessionStorage:', storageError);
            }
            // Still store the URL (smaller)
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

        setPhase1Status("complete");
        setProgress(60);
        addLog(`Phase 1 complete: ${payload.stats?.totalBytesFormatted || "unknown size"} processed`);
        if (payload.stats) {
          addLog(`  Files processed: ${payload.stats.includedFiles || 0} included, ${payload.stats.skippedFiles || 0} skipped`);
        }

      } catch (error) {
        if (cancelled) return;
        
        // Extract error details
        let errorMsg = "Unknown error";
        let errorDetail = "";
        
        if (error instanceof Error) {
          errorMsg = error.message;
          // Check if error has detail attached
          if ((error as any).detail) {
            errorDetail = (error as any).detail;
          } else if ((error as any).errorBody) {
            const errorBody = (error as any).errorBody;
            errorMsg = errorBody.error || errorMsg;
            errorDetail = errorBody.detail || "";
          }
        }
        
        // Log detailed error
        addLog(`ERROR: Ingestion failed - ${errorMsg}`);
        if (errorDetail) {
          addLog(`  Details: ${errorDetail}`);
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
        
        // For other errors, allow fallback but warn user
        addLog("⚠️  Falling back to demo content...");
        addLog("Note: Video will use placeholder data instead of repository content");
        setPhase1Status("complete");
        setProgress(60);
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
      let manifestWithCode: VideoManifest;

      if (USE_MOCK_MANIFEST) {
        addLog("Using mock manifest (USE_MOCK_MANIFEST=true)");
        await animateSteps(phase2Steps, 60, 92);
        if (cancelled) return;
        
        addLog("Enriching mock manifest with code content...");
        manifestWithCode = enrichManifestWithCode(mockManifest, fileContents);
      } else {
        addLog("Generating manifest with Gemini AI...");
        setCurrentStep("Calling Gemini API...");
        setProgress(65);
        
        try {
          // Generate manifest with Gemini
          addLog("Analyzing repository structure...");
          await new Promise(r => setTimeout(r, 500));
          setProgress(70);
          
          addLog("Creating video script with AI...");
          const geminiManifest = await generateManifestWithGemini(repoUrl, repoName, repoContent);
          
          await new Promise(r => setTimeout(r, 500));
          setProgress(85);
          
          addLog("Enriching manifest with actual code content...");
          // Enrich the Gemini-generated manifest with actual code from ingestion
          manifestWithCode = enrichManifestWithCode(geminiManifest, fileContents);
          
          addLog("✓ Manifest generated successfully with Gemini AI!");
          setProgress(92);
        } catch (error) {
          console.error('Gemini manifest generation failed:', error);
          addLog("⚠️  WARNING: Gemini generation failed, falling back to template");
          addLog(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          // Fallback to mock manifest
          await animateSteps(phase2Steps, 60, 92);
          if (cancelled) return;
          
          addLog("Using template manifest with code content...");
          manifestWithCode = enrichManifestWithCode(mockManifest, fileContents);
        }
      }

      addLog("Applying director's cut narrative pattern...");
      manifestWithCode = applyDirectorsCutPattern(
        manifestWithCode,
        fileContents,
        repoName
      );
      
      if (cancelled) return;
      
      // Log scene details
      addLog(`Total scenes created: ${manifestWithCode.scenes.length}`);
      const totalDuration = manifestWithCode.scenes.reduce((sum, s) => sum + (s.duration_seconds || 15), 0);
      addLog(`Estimated video duration: ${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`);
      
      // Save to Supabase
      if (currentProjectId && user?.id) {
        addLog("Saving manifest to database...");
        try {
          // First try with all fields including optional ones
          await projectsService.update(currentProjectId, user.id, {
            status: 'ready',
            manifest: manifestWithCode,
            duration_seconds: totalDuration,
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
        const manifestJson = JSON.stringify(manifestWithCode);
        sessionStorage.setItem("video-manifest", manifestJson);
        sessionStorage.setItem("repo-url", repoUrl);
        if (currentProjectId) {
          sessionStorage.setItem("project-id", currentProjectId);
        }
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
          sessionStorage.setItem("repo-url", repoUrl);
          if (currentProjectId) {
            sessionStorage.setItem("project-id", currentProjectId);
          }
        } catch (e) {
          // Ignore if even small items fail
        }
      }

      setPhase2Status("complete");
      setProgress(100);
      addLog("Phase 2 complete: Manifest ready");
      addLog("--- All phases complete ---");
      addLog("Your video is ready! Click 'Continue to Studio' to start editing.");
    };

    runProcessing();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [navigate, repoUrl, repoName, addLog, retryKey, user?.id]);

  const overallStatus: PhaseStatus =
    phase1Status === "error" ? "error" :
    phase2Status === "complete" ? "complete" :
    phase1Status === "running" || phase2Status === "running" ? "running" : "idle";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute inset-0 bg-radial-gradient" />

      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden opacity-5">
        {Array.from({ length: 20 }).map((_, i) => (
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
            {Math.random() > 0.5 ? "1" : "0"}
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto px-4">
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
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-75" />
          </div>
        </div>

        {/* Current Step */}
        <div className="text-center mb-6">
          <h3 className="text-base font-medium mb-1">
            {overallStatus === "complete" ? "Ready!" : currentStep || "Initializing..."}
          </h3>
          <p className="text-sm text-muted-foreground">
            {overallStatus === "complete" ? "Your video is ready" : "Analyzing codebase..."}
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
            <span className="text-xs text-muted-foreground font-mono ml-2">processing.log</span>
            <span className="text-xs text-muted-foreground/50 ml-auto">{logs.length} entries</span>
          </div>
          <div className="p-3 h-48 overflow-y-auto font-mono text-xs space-y-0.5 bg-black/20 scroll-smooth">
            {logs.map((log, index) => {
              const isWarning = log.includes("WARNING") || log.includes("Warning");
              const isError = log.includes("ERROR") || log.includes("Error");
              const isSuccess = log.includes("complete") || log.includes("Complete");
              
              return (
                <div
                  key={index}
                  className={`${
                    isError ? "text-destructive" :
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

        {/* Error Actions */}
        {overallStatus === "error" && (
          <div className="flex flex-col gap-3 mt-6">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-destructive mb-1">Processing Failed</h3>
                  <p className="text-sm text-muted-foreground">
                    The ingestion process encountered an error. Please check the logs above for details.
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
        {overallStatus === "complete" && <CompletionActions repoName={repoName} />}
      </div>
    </div>
  );
};

// Completion screen with auth-aware CTA
const CompletionActions = ({ repoName }: { repoName: string }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

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
      <div className="bg-success/10 border border-success/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-success mb-1">Video Generated Successfully!</h3>
            <p className="text-sm text-muted-foreground">
              Your code walkthrough video for <span className="font-medium">{repoName}</span> is ready to preview.
            </p>
          </div>
        </div>
      </div>

      {/* Auth-aware CTA */}
      {isAuthenticated ? (
        <Button 
          size="lg"
          className="w-full"
          onClick={() => navigate("/studio")}
        >
          <Play className="h-4 w-4 mr-2" />
          Continue to Studio
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            Sign in to access the Studio and edit your video
          </p>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              asChild
            >
              <Link to="/login" state={{ from: '/studio' }}>
                Sign In
              </Link>
            </Button>
            <Button 
              className="flex-1"
              asChild
            >
              <Link to="/signup" state={{ from: '/studio' }}>
                Create Account
              </Link>
            </Button>
          </div>
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
  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/70 px-3 py-2">
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

  const lookupCode = (filePath?: string) => {
    if (!filePath) return undefined;
    if (fileContents[filePath]) return fileContents[filePath];
    const normalizedPath = normalizePath(filePath);
    if (normalizedContents.has(normalizedPath)) return normalizedContents.get(normalizedPath);
    const suffixMatch = Object.keys(fileContents).find((path) =>
      normalizePath(path).endsWith(`/${normalizedPath}`)
    );
    return suffixMatch ? fileContents[suffixMatch] : undefined;
  };
  
  return {
    ...manifest,
    repo_files: resolvedRepoFiles,
    scenes: manifest.scenes.map((scene) => {
      // Try to get actual code from ingested content
      const actualCode = lookupCode(scene.file_path);
      const trimmedActual = actualCode?.trim();
      const trimmedExisting = scene.code?.trim();
      
      // If we have actual code, use it; otherwise use existing code or generate placeholder
      const code = trimmedActual ? actualCode : trimmedExisting ? scene.code : generatePlaceholderCode(scene);
      
      return { ...scene, code };
    }),
  };
}

// Parse gitingest output format to extract file contents
function parseRepoContent(content: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!content) return files;

  const patterns = [
    /={3,}\nFile:\s*(.+?)\n={3,}\n([\s\S]*?)(?=\n={3,}\nFile:|$)/g,
    /-+\nFile:\s*(.+?)\n-+\n([\s\S]*?)(?=\n-+\nFile:|$)/g,
    /-----\s*FILE:\s*(.+?)\s*-----\n([\s\S]*?)(?=\n-----\s*FILE:|$)/gi,
  ];

  const tryPattern = (pattern: RegExp) => {
    pattern.lastIndex = 0;
    let match;
    let matches = 0;
    while ((match = pattern.exec(content)) !== null) {
      const filePath = match[1].trim();
      const fileContent = match[2].trim();
      if (filePath) {
        files[filePath] = fileContent;
        matches += 1;
      }
    }
    return matches;
  };

  for (const pattern of patterns) {
    if (tryPattern(pattern) > 0) {
      return files;
    }
  }

  // Fallback: line-based parsing for headers like "File: path/to/file"
  const lines = content.split(/\r?\n/);
  let currentPath = "";
  let buffer: string[] = [];
  const flush = () => {
    if (!currentPath) return;
    files[currentPath] = buffer.join("\n").trim();
    buffer = [];
  };

  const headerRegex = /^(?:[=-]+\s*)?file:\s*(.+?)(?:\s*[=-]+)?$/i;
  for (const line of lines) {
    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      flush();
      currentPath = headerMatch[1].trim();
      continue;
    }
    if (currentPath) {
      buffer.push(line);
    }
  }
  flush();

  return files;
}

function applyDirectorsCutPattern(
  manifest: VideoManifest,
  fileContents: Record<string, string>,
  repoName: string
): VideoManifest {
  const allFiles = Object.keys(fileContents);
  if (allFiles.length === 0) {
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
          ? `${summary}`
          : `In this quick tour, we'll explore how the application works from end to end.`;
      }
      return `We start at ${baseName}, the entry point that wires routing, providers, and the initial UI.`;
    }

    if (section === "brain") {
      const focus = lower.includes("prompt")
        ? "prompt construction"
        : lower.includes("agent")
        ? "agent orchestration"
        : lower.includes("model") || lower.includes("llm")
        ? "model invocation"
        : lower.includes("embedding") || lower.includes("vector")
        ? "retrieval and embeddings"
        : "core decision logic";
      return `Here in ${baseName} is the intelligence layer. This handles ${focus} to drive the product behavior.`;
    }

    if (section === "guts") {
      const focus = lower.includes("schema") || lower.includes("db") || lower.includes("sql")
        ? "data modeling and persistence"
        : lower.includes("cache")
        ? "caching and performance"
        : "state and data flow";
      return `The data pipeline lives in ${baseName}. It manages ${focus} so the UI stays fast and consistent.`;
    }

    if (section === "infra") {
      const focus = lower.includes("auth")
        ? "authentication and access control"
        : lower.includes("policy") || lower.includes("rules")
        ? "security policies"
        : "configuration and deployment readiness";
      return `In ${baseName}, we handle ${focus} to keep the application production-ready.`;
    }

    if (section === "outro") {
      return summary
        ? `${summary}`
        : `That completes the tour: interface, intelligence, data flow, and infrastructure.`;
    }

    return `Let's look at ${baseName} to understand how this piece fits into the overall architecture.`;
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
