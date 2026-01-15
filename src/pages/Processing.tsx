import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Terminal, Loader2 } from "lucide-react";

const processingSteps = [
  { text: "Cloning repository...", duration: 1500 },
  { text: "Reading 147 files...", duration: 2000 },
  { text: "Analyzing directory structure...", duration: 1800 },
  { text: "Identifying authentication flow...", duration: 2200 },
  { text: "Mapping component dependencies...", duration: 1600 },
  { text: "Generating script outline...", duration: 2000 },
  { text: "Writing scene narrations...", duration: 2400 },
  { text: "Rendering video frames...", duration: 3000 },
  { text: "Finalizing export...", duration: 1500 },
];

const Processing = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let stepIndex = 0;
    let totalDuration = processingSteps.reduce((acc, step) => acc + step.duration, 0);
    let elapsed = 0;

    const processStep = () => {
      if (stepIndex < processingSteps.length) {
        const step = processingSteps[stepIndex];
        setLogs((prev) => [...prev, `> ${step.text}`]);
        setCurrentStep(stepIndex);
        
        elapsed += step.duration;
        setProgress(Math.round((elapsed / totalDuration) * 100));

        stepIndex++;
        setTimeout(processStep, step.duration);
      } else {
        // Complete - navigate to studio
        setTimeout(() => navigate("/studio"), 500);
      }
    };

    const timer = setTimeout(processStep, 500);
    return () => clearTimeout(timer);
  }, [navigate]);

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
              <Loader2 className="h-6 w-6 text-primary animate-spin mb-1" />
              <span className="text-2xl font-bold">{progress}%</span>
            </div>

            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-75" />
          </div>
        </div>

        {/* Current Step */}
        <div className="text-center mb-8">
          <h2 className="text-lg font-medium mb-2">
            {processingSteps[currentStep]?.text.replace("...", "") || "Initializing..."}
          </h2>
          <p className="text-sm text-muted-foreground">
            Please wait while we analyze your repository
          </p>
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
                  index === logs.length - 1 ? "text-primary" : "text-muted-foreground"
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
