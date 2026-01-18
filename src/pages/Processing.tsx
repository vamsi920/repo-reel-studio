import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Terminal, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { generateVideoManifest } from "@/lib/geminiDirector";

const ingestionSteps = [
  { text: "Cloning repository...", progress: 18 },
  { text: "Walking folder tree...", progress: 38 },
  { text: "Filtering source files...", progress: 58 },
  { text: "Concatenating code payload...", progress: 76 },
  { text: "Packaging for Gemini 2.0 input...", progress: 80 },
];

const directorSteps = [
  { text: "Generating director prompt...", progress: 86 },
  { text: "Analyzing codebase structure...", progress: 90 },
  { text: "Mapping components and features...", progress: 94 },
  { text: "Building scene manifest (3+ min)...", progress: 97 },
  { text: "Rendering video manifest JSON...", progress: 99 },
];

type IngestionStats = {
  includedFiles: number;
  skippedFiles: number;
  totalBytes: number;
  totalBytesFormatted: string;
  durationMs: number;
};

type PhaseStatus = "idle" | "queued" | "running" | "complete" | "error";

const Processing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [phase1Status, setPhase1Status] = useState<PhaseStatus>("idle");
  const [phase2Status, setPhase2Status] = useState<PhaseStatus>("queued");
  const [stats, setStats] = useState<IngestionStats | null>(null);

  const repoUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const encodedRepo = params.get("repo") || "";
    // Decode the URL that was encoded by the Dashboard
    return encodedRepo ? decodeURIComponent(encodedRepo) : "";
  }, [location.search]);

  const phases = useMemo(
    () => [
      {
        title: "Phase 1: Ingestion",
        description: "Clone and bundle repository text for Gemini 2.0.",
        status: phase1Status,
      },
      {
        title: "Phase 2: Director",
        description: "Gemini 2.0 generates comprehensive video manifest (3+ min).",
        status: phase2Status,
      },
      {
        title: "Phase 3: Storyboard Drafting",
        description: "Draft narration and scene breakdowns.",
        status: "queued" as PhaseStatus,
      },
    ],
    [phase1Status, phase2Status]
  );

  const activeSteps =
    phase2Status === "running" || phase2Status === "complete"
      ? directorSteps
      : ingestionSteps;
  const overallStatus: PhaseStatus =
    phase1Status === "error" || phase2Status === "error"
      ? "error"
      : phase2Status === "complete"
        ? "complete"
        : phase1Status === "running" || phase2Status === "running"
          ? "running"
          : "idle";

  useEffect(() => {
    if (!repoUrl) {
      setPhase1Status("error");
      setPhase2Status("queued");
      setLogs(["> Missing repository URL. Please return to the dashboard."]);
      return;
    }

    const controller = new AbortController();
    let stepIndex = 0;
    let stepTimer: ReturnType<typeof setInterval> | null = null;

    setPhase1Status("running");
    setPhase2Status("queued");
    setLogs([`> Starting ingestion for ${repoUrl}`]);
    setProgress(6);

    const runSteps = (steps: typeof ingestionSteps) => {
      stepIndex = 0;
      const advanceStep = () => {
        if (stepIndex < steps.length) {
          const step = steps[stepIndex];
          setLogs((prev) => [...prev, `> ${step.text}`]);
          setCurrentStep(stepIndex);
          setProgress(step.progress);
          stepIndex += 1;
        } else if (stepTimer) {
          clearInterval(stepTimer);
          stepTimer = null;
        }
      };

      advanceStep();
      stepTimer = setInterval(advanceStep, 1100);
    };

    runSteps(ingestionSteps);

    const runIngestion = async () => {
      try {
        setLogs((prev) => [...prev, `> Connecting to ingestion server...`]);

        const response = await fetch("/api/ingest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ repoUrl }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          let errorMessage =
            errorBody.error || `Server error (${response.status})`;
          let errorDetail = "";

          if (errorBody.detail) {
            if (typeof errorBody.detail === "object") {
              errorDetail = `\n> Details: ${
                errorBody.detail.error ||
                errorBody.detail.detail ||
                JSON.stringify(errorBody.detail)
              }`;
            } else {
              errorDetail = `\n> Details: ${errorBody.detail}`;
            }
          }
          throw new Error(errorMessage + errorDetail);
        }

        const payload = (await response.json()) as {
          stats: IngestionStats;
          content: string;
        };

        // Store the ingested content in sessionStorage for later use
        if (payload.content) {
          sessionStorage.setItem("repo-content", payload.content);
          sessionStorage.setItem("repo-url", repoUrl);
        }

        setStats(payload.stats);
        setPhase1Status("complete");
        setLogs((prev) => [
          ...prev,
          `> Ingestion complete: ${payload.stats.includedFiles} files (${payload.stats.totalBytesFormatted})`,
          `> Processing time: ${(payload.stats.durationMs / 1000).toFixed(2)}s`,
        ]);

        if (stepTimer) {
          clearInterval(stepTimer);
          stepTimer = null;
        }

        setPhase2Status("running");
        setLogs((prev) => [...prev, `> Starting Gemini 2.0 director pass...`]);
        runSteps(directorSteps);

         const { manifest, source, metadata } = await generateVideoManifest(
           repoUrl,
           payload.content || ""
         );

         sessionStorage.setItem("video-manifest", JSON.stringify(manifest));
         
         // Download manifest as text file
         const manifestText = JSON.stringify(manifest, null, 2);
         const blob = new Blob([manifestText], { type: "text/plain" });
         const url = URL.createObjectURL(blob);
         const a = document.createElement("a");
         a.href = url;
         a.download = `${repoUrl.split("/").pop()}-manifest.txt`;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         URL.revokeObjectURL(url);
         
         // Log token usage
         if (metadata) {
           setLogs((prev) => [
             ...prev,
             `> Gemini response: ${(metadata.durationMs / 1000).toFixed(2)}s`,
             `> Tokens used: ${metadata.totalTokens.toLocaleString()} (prompt: ${metadata.promptTokens.toLocaleString()}, completion: ${metadata.completionTokens.toLocaleString()})`,
             `> Segments processed: ${metadata.segmentsProcessed}`,
           ]);
         }

         setPhase2Status("complete");
         setProgress(100);
         setLogs((prev) => [
           ...prev,
           `> Director manifest ready: ${manifest.scenes.length} scenes`,
           `> Manifest downloaded: ${repoUrl.split("/").pop()}-manifest.txt`,
           `> Redirecting to studio...`,
         ]);

        setTimeout(() => navigate("/studio"), 1200);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPhase1Status((prev) => (prev === "complete" ? prev : "error"));
        setPhase2Status("error");
        
        let errorMessage = "Unknown error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        // Add specific error messages for common issues
        if (errorMessage.includes("GEMINI_API_KEY")) {
          setLogs((prev) => [
            ...prev,
            `> ❌ Error: ${errorMessage}`,
            `> Set VITE_GEMINI_API_KEY in your .env file`,
            `> Get a key from: https://aistudio.google.com/app/apikey`,
          ]);
        } else if (errorMessage.includes("fetch") || errorMessage.includes("NetworkError") || errorMessage.includes("Failed to fetch")) {
          setLogs((prev) => [
            ...prev,
            `> ❌ Error: Cannot connect to ingestion server`,
            `> Please ensure it's running: npm run ingest:server`,
          ]);
        } else if (errorMessage.includes("Gemini")) {
          setLogs((prev) => [
            ...prev,
            `> ❌ Error: ${errorMessage}`,
            `> Check your API key and try again.`,
          ]);
        } else {
          setLogs((prev) => [
            ...prev,
            `> ❌ Error: ${errorMessage}`,
            `> Please check logs and try again.`,
          ]);
        }
      } finally {
        if (stepTimer) {
          clearInterval(stepTimer);
        }
      }
    };

    runIngestion();

    return () => {
      controller.abort();
      if (stepTimer) {
        clearInterval(stepTimer);
      }
    };
  }, [navigate, repoUrl]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute inset-0 bg-radial-gradient" />

      {/* Animated binary background */}
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Terminal className="h-5 w-5" />
            </div>
            <span className="font-semibold text-lg">Repo-to-Reel</span>
          </div>
        </div>

        {/* Phase Timeline */}
        <div className="grid gap-3 mb-8">
          {phases.map((phase) => {
            const normalizedStatus: Exclude<PhaseStatus, "idle"> =
              phase.status === "idle" ? "queued" : phase.status;
            return (
              <div
                key={phase.title}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">{phase.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {phase.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {normalizedStatus === "running" && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-processing animate-pulse" />
                      <span className="text-processing">Running</span>
                    </>
                  )}
                  {normalizedStatus === "complete" && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-success">Complete</span>
                    </>
                  )}
                  {normalizedStatus === "error" && (
                    <>
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">Failed</span>
                    </>
                  )}
                  {normalizedStatus === "queued" && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
                      <span className="text-muted-foreground">Queued</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress Circle */}
        <div className="flex justify-center mb-8">
          <div className="relative h-32 w-32">
            {/* Background circle */}
            <svg className="h-full w-full -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                className="fill-none stroke-muted"
                strokeWidth="8"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                className="fill-none stroke-primary transition-all duration-500"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${progress * 3.52} 352`}
              />
            </svg>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {overallStatus === "complete" ? (
                <CheckCircle2 className="h-6 w-6 text-success mb-1" />
              ) : overallStatus === "error" ? (
                <AlertTriangle className="h-6 w-6 text-destructive mb-1" />
              ) : (
                <Loader2 className="h-6 w-6 text-primary animate-spin mb-1" />
              )}
              <span className="text-2xl font-bold">{progress}%</span>
            </div>

            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-75" />
          </div>
        </div>

        {/* Current Step */}
        <div className="text-center mb-8">
          <h2 className="text-lg font-medium mb-2">
            {activeSteps[currentStep]?.text.replace("...", "") ||
              "Initializing..."}
          </h2>
          <p className="text-sm text-muted-foreground">
            {overallStatus === "error"
              ? "We hit a snag during ingestion or the director pass."
              : phase2Status === "running"
                ? "Phase 2 is building comprehensive manifest with Gemini 2.0."
                : phase2Status === "complete"
                  ? "Director manifest ready (3+ minutes of content)."
                  : "Phase 1 is preparing codebase for Gemini 2.0."}
          </p>
          {stats && (
            <p className="mt-2 text-xs text-muted-foreground">
              {stats.includedFiles} files included · {stats.skippedFiles}{" "}
              skipped · {stats.totalBytesFormatted}
            </p>
          )}
        </div>

        {/* Terminal Log */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Terminal header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-destructive/50" />
              <div className="w-3 h-3 rounded-full bg-warning/50" />
              <div className="w-3 h-3 rounded-full bg-success/50" />
            </div>
            <span className="text-xs text-muted-foreground font-mono ml-2">
              processing.log
            </span>
          </div>

          {/* Log content */}
          <div className="p-4 h-48 overflow-y-auto font-mono text-sm space-y-1">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`${
                  index === logs.length - 1
                    ? "text-primary"
                    : "text-muted-foreground"
                } animate-fade-in`}
              >
                {log}
                {index === logs.length - 1 && (
                  <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Processing;
