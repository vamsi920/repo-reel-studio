import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const HeroSection = () => {
  const [repoUrl, setRepoUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const navigate = useNavigate();

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
      {/* Background Effects */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute inset-0 bg-radial-gradient" />
      
      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-glow-secondary/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "-3s" }} />

      <div className="container relative mx-auto px-4 py-20 md:py-32">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-8 animate-fade-in">
            <Sparkles className="h-4 w-4" />
            <span>Powered by Gemini 1.5 Pro</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in-up">
            Turn your GitHub Repository into an{" "}
            <span className="gradient-text">Onboarding Video</span> in Seconds.
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            Stop writing stale documentation. Let AI analyze your codebase and generate a visual architectural walkthrough automatically.
          </p>

          {/* CTA Input */}
          <div className="w-full max-w-2xl animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex flex-col sm:flex-row gap-3 p-2 rounded-2xl bg-secondary/30 border border-border/50 backdrop-blur-sm">
              <Input
                variant="hero"
                placeholder="Paste GitHub URL..."
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  setUrlError("");
                }}
                className="flex-1 border-0 bg-transparent focus:ring-0"
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              />
              <Button
                variant="hero"
                size="lg"
                className="shrink-0 gap-2"
                onClick={handleGenerate}
              >
                Generate Video
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            {urlError && (
              <p className="text-xs text-destructive mt-2">
                {urlError}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Try it free • No credit card required
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
