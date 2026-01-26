import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Play, Zap, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MousePos = { x: number; y: number };

export const HeroSection = ({ mousePos = { x: 0.5, y: 0.5 } }: { mousePos?: MousePos }) => {
  const [repoUrl, setRepoUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [cardSpotlight, setCardSpotlight] = useState({ x: 0.5, y: 0.5 });
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleTryDemo = () => {
    setRepoUrl("vercel/next.js");
    setUrlError("");
    // Auto-submit after a brief delay for UX
    setTimeout(() => {
      navigate(`/processing?repo=${encodeURIComponent("https://github.com/vercel/next.js")}`);
    }, 300);
  };

  const onCardMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setTilt({
      x: Math.max(-8, Math.min(8, -x * 16)),
      y: Math.max(-8, Math.min(8, y * 16)),
    });
    setCardSpotlight({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  const onCardMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setCardSpotlight({ x: 0.5, y: 0.5 });
  };

  const validateAndCleanUrl = (url: string): string | null => {
    let cleanUrl = url.trim();

    if (!cleanUrl) {
      setUrlError("Please enter a GitHub repository URL.");
      return null;
    }

    if (/^[\w-]+\/[\w-]+$/.test(cleanUrl)) {
      cleanUrl = `https://github.com/${cleanUrl}`;
    }

    try {
      const parsed = new URL(cleanUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        setUrlError("URL must use http or https protocol.");
        return null;
      }

      if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        if (pathParts.length < 2) {
          setUrlError("Invalid GitHub repository URL. Expected format: github.com/user/repo");
          return null;
        }
      }
    } catch {
      setUrlError("Invalid URL format.");
      return null;
    }

    return cleanUrl;
  };

  const handleGenerate = () => {
    setUrlError("");
    const cleanedUrl = validateAndCleanUrl(repoUrl);
    if (cleanedUrl) {
      navigate(`/processing?repo=${encodeURIComponent(cleanedUrl)}`);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* Multi-color cursor-following overlay – cyan, rose, amber, indigo, blue */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle 50vmax at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(34,211,238,0.14) 0%, transparent 50%),
            radial-gradient(circle 40vmax at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(236,72,153,0.11) 0%, transparent 50%),
            radial-gradient(circle 35vmax at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(251,146,60,0.1) 0%, transparent 50%),
            radial-gradient(circle 42vmax at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(99,102,241,0.1) 0%, transparent 50%),
            radial-gradient(circle 45vmax at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(59,130,246,0.12) 0%, transparent 50%)
          `,
        }}
      />

      {/* Background */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-blue-400/5 via-transparent to-cyan-400/5" />
      
      {/* Animated gradient orbs – blue, cyan, rose, amber */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-to-r from-blue-400/25 to-cyan-400/20 rounded-full blur-3xl animate-float opacity-70" />
      <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-gradient-to-r from-cyan-400/20 to-blue-400/25 rounded-full blur-3xl animate-float opacity-60" style={{ animationDelay: "-3s" }} />
      <div className="absolute top-1/2 right-1/3 w-[300px] h-[300px] bg-gradient-to-r from-rose-400/18 to-amber-400/15 rounded-full blur-3xl animate-float opacity-50" style={{ animationDelay: "-5s" }} />

      <div className="container relative mx-auto px-4 py-20 md:py-32">
        <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
          {/* AI Badge - Prominent */}
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-100 via-cyan-50 to-amber-50 border border-blue-200/60 text-sm mb-8 animate-fade-in backdrop-blur-sm">
            <div className="relative flex items-center gap-2">
              <div className="relative">
                <Sparkles className="h-5 w-5 text-primary" />
                <div className="absolute inset-0 animate-ping">
                  <Sparkles className="h-5 w-5 text-primary opacity-50" />
                </div>
              </div>
              <span className="font-bold bg-gradient-to-r from-primary via-cyan-600 to-blue-600 bg-clip-text text-transparent">
                Powered by Advanced AI
              </span>
            </div>
            <div className="h-4 w-px bg-slate-300" />
            <span className="text-slate-600 flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Intelligent Code Analysis
            </span>
          </div>

          {/* Headline - More dynamic */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-6 animate-fade-in-up text-slate-800">
            Transform Any{" "}
            <span className="relative inline-block">
              <Github className="inline-block h-12 md:h-16 lg:h-20 w-12 md:w-16 lg:w-20 text-slate-700" />
            </span>{" "}
            Repository Into a{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-primary via-cyan-500 to-blue-500 bg-clip-text text-transparent">
                Stunning Video
              </span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                <path d="M2 10C50 4 100 2 150 6C200 10 250 4 298 8" stroke="url(#hero-gradient)" strokeWidth="3" strokeLinecap="round"/>
                <defs>
                  <linearGradient id="hero-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="hsl(217, 91%, 60%)" />
                    <stop offset="50%" stopColor="hsl(199, 89%, 48%)" />
                    <stop offset="100%" stopColor="hsl(199, 89%, 48%)" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-4 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            Stop writing stale documentation. Let <span className="text-primary font-semibold">advanced AI</span> analyze your codebase and generate a 
            <span className="text-foreground font-medium"> beautiful architectural walkthrough</span> in seconds.
          </p>

          {/* Stats Row */}
          <div className="flex items-center gap-6 mb-10 text-sm animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-muted-foreground">Real-time processing</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">30 FPS smooth playback</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="text-muted-foreground">AI-generated narration</span>
            </div>
          </div>

          {/* CTA Input - More prominent */}
          <div className="w-full max-w-2xl animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="relative">
              {/* Glow effect behind input */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/40 via-cyan-500/40 to-rose-400/35 rounded-2xl blur-lg opacity-40" />
              
              <div
                ref={cardRef}
                onMouseMove={onCardMouseMove}
                onMouseLeave={onCardMouseLeave}
                className="relative flex flex-col sm:flex-row gap-3 p-2 rounded-2xl bg-card/90 border border-border/60 backdrop-blur-sm transition-transform duration-200 ease-out overflow-hidden"
                style={{
                  transformStyle: "preserve-3d",
                  transform: `perspective(800px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) scale(${tilt.x || tilt.y ? 1.02 : 1})`,
                }}
              >
                {/* Cursor-following light reflection on card */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at ${cardSpotlight.x * 100}% ${cardSpotlight.y * 100}%, rgba(255,255,255,0.7) 0%, transparent 45%)`,
                  }}
                />
                <div className="relative flex-1 flex items-center gap-2 px-2">
                  <Github className="h-5 w-5 text-muted-foreground shrink-0" />
                  <Input
                    variant="hero"
                    placeholder="Paste GitHub URL or username/repo..."
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      setUrlError("");
                    }}
                    className="flex-1 border-0 bg-transparent focus:ring-0 text-base"
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  />
                </div>
                <Button
                  variant="hero"
                  size="lg"
                  className="relative shrink-0 gap-2 bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shadow-lg shadow-primary/20"
                  onClick={handleGenerate}
                >
                  Generate Video
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {urlError && (
              <p className="text-xs text-destructive mt-2">
                {urlError}
              </p>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTryDemo}
                className="gap-2"
              >
                <Play className="h-3.5 w-3.5" />
                Try with Sample Repo
              </Button>
              <p className="text-sm text-muted-foreground flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span className="text-green-500">✓</span> Free to use
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-green-500">✓</span> No signup required
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-green-500">✓</span> Instant results
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
