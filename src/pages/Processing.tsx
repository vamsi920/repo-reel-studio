import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Terminal, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const ingestionSteps = [
  { text: "Cloning repository...", progress: 18 },
  { text: "Walking folder tree...", progress: 38 },
  { text: "Filtering source files...", progress: 58 },
  { text: "Concatenating code payload...", progress: 76 },
  { text: "Packaging for Gemini input...", progress: 92 },
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
  const [status, setStatus] = useState<PhaseStatus>("idle");
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
        status,
      },
      {
        title: "Phase 2: Structure Mapping",
        description: "Identify modules, flows, and data paths.",
        status: "queued" as PhaseStatus,
      },
      {
        title: "Phase 3: Storyboard Drafting",
        description: "Draft narration and scene breakdowns.",
        status: "queued" as PhaseStatus,
      },
    ],
    [status]
  );

  useEffect(() => {
    if (!repoUrl) {
      setStatus("error");
      setLogs(["> Missing repository URL. Please return to the dashboard."]);
      return;
    }

    const controller = new AbortController();
    let stepIndex = 0;

    setStatus("running");
    setLogs([`> Starting ingestion for ${repoUrl}`]);
    setProgress(6);

    const advanceStep = () => {
      if (stepIndex < ingestionSteps.length) {
        const step = ingestionSteps[stepIndex];
        setLogs((prev) => [...prev, `> ${step.text}`]);
        setCurrentStep(stepIndex);
        setProgress(step.progress);
        stepIndex += 1;
      }
    };

    advanceStep();
    const stepTimer = setInterval(advanceStep, 1100);

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
        setStatus("complete");
        setProgress(100);
        setLogs((prev) => [
          ...prev,
          `> Ingestion complete: ${payload.stats.includedFiles} files (${payload.stats.totalBytesFormatted})`,
          `> Processing time: ${(payload.stats.durationMs / 1000).toFixed(2)}s`,
          `> Redirecting to studio...`,
        ]);

        setTimeout(() => navigate("/studio"), 1200);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("error");

        let errorMessage = "Unknown error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        // Add specific error messages for common issues
        if (errorMessage.includes("fetch")) {
          errorMessage =
            "Cannot connect to ingestion server. Please ensure it's running on port 8787.";
        } else if (
          errorMessage.includes("NetworkError") ||
          errorMessage.includes("Failed to fetch")
        ) {
          errorMessage =
            "Network error. Check if the ingestion server is running (npm run ingest:server).";
        }

        setLogs((prev) => [
          ...prev,
          `> ❌ Error: ${errorMessage}`,
          `> Please check the server logs or try again.`,
        ]);
      } finally {
        clearInterval(stepTimer);
      }
    };

    runIngestion();

    return () => {
      controller.abort();
      clearInterval(stepTimer);
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
              {status === "complete" ? (
                <CheckCircle2 className="h-6 w-6 text-success mb-1" />
              ) : status === "error" ? (
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
            {ingestionSteps[currentStep]?.text.replace("...", "") ||
              "Initializing..."}
          </h2>
          <p className="text-sm text-muted-foreground">
            {status === "error"
              ? "We hit a snag during ingestion."
              : "Phase 1 is preparing code for Gemini 2.0."}
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
