import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockManifest } from "@/data/mockManifest";
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
  const [currentStep, setCurrentStep] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [phase1Status, setPhase1Status] = useState<PhaseStatus>("idle");
  const [phase2Status, setPhase2Status] = useState<PhaseStatus>("idle");
  const [retryKey, setRetryKey] = useState(0);
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
      // ===== PHASE 1: INGESTION =====
      setPhase1Status("running");
      addLog(`Starting video generation pipeline...`);
      addLog(`Target repository: ${repoName}`);
      addLog(`Full URL: ${repoUrl}`);
      setProgress(5);

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
        
        // Store ingested content
        if (payload.content) {
          const contentSize = (payload.content.length / 1024).toFixed(1);
          addLog(`Received ${contentSize} KB of repository content`);
          sessionStorage.setItem("repo-content", payload.content);
          sessionStorage.setItem("repo-url", repoUrl);
        }

        setPhase1Status("complete");
        setProgress(60);
        addLog(`Phase 1 complete: ${payload.stats?.totalBytesFormatted || "unknown size"} processed`);
        if (payload.stats) {
          addLog(`  Files processed: ${payload.stats.totalFiles || 0}`);
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
          // Store error marker for Studio page
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
      addLog("Using pre-built manifest template (AI generation skipped)");

      await animateSteps(phase2Steps, 60, 92);

      if (cancelled) return;

      // Prepare final manifest with code content from ingestion
      addLog("Enriching manifest with code content...");
      const repoContent = sessionStorage.getItem("repo-content") || "";
      const manifestWithCode = enrichManifestWithCode(mockManifest, repoContent);
      
      // Log scene details
      addLog(`Total scenes created: ${manifestWithCode.scenes.length}`);
      const totalDuration = manifestWithCode.scenes.reduce((sum, s) => sum + (s.duration_seconds || 15), 0);
      addLog(`Estimated video duration: ${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`);
      
      addLog("Saving manifest to session storage...");
      sessionStorage.setItem("video-manifest", JSON.stringify(manifestWithCode));

      setPhase2Status("complete");
      setProgress(100);
      addLog("Phase 2 complete: Manifest ready");
      addLog("--- All phases complete ---");
      addLog("Launching GitFlick Studio...");

      // Navigate to studio
      setTimeout(() => {
        if (!cancelled) {
          navigate("/studio");
        }
      }, 1000);
    };

    runProcessing();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [navigate, repoUrl, repoName, addLog, retryKey]);

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
      </div>
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
function enrichManifestWithCode(manifest: typeof mockManifest, repoContent: string) {
  // Parse the ingested content to extract file contents
  const fileContents = parseRepoContent(repoContent);
  
  return {
    ...manifest,
    scenes: manifest.scenes.map((scene) => {
      const code = fileContents[scene.file_path] || generatePlaceholderCode(scene);
      return { ...scene, code };
    }),
  };
}

// Parse gitingest output format to extract file contents
function parseRepoContent(content: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!content) return files;

  // gitingest format: files are separated by headers like:
  // ================================================
  // File: path/to/file.ts
  // ================================================
  const filePattern = /={48,}\nFile: (.+?)\n={48,}\n([\s\S]*?)(?=\n={48,}\nFile:|$)/g;
  let match;

  while ((match = filePattern.exec(content)) !== null) {
    const filePath = match[1].trim();
    const fileContent = match[2].trim();
    files[filePath] = fileContent;
  }

  return files;
}

// Generate placeholder code when actual code is not available
function generatePlaceholderCode(scene: typeof mockManifest.scenes[0]): string {
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
