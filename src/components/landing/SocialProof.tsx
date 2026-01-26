import { Sparkles, Zap, Brain, Cpu } from "lucide-react";

export const SocialProof = () => {
  const features = [
    { icon: Brain, label: "Gemini 3 Pro", desc: "Latest AI Model" },
    { icon: Zap, label: "30 FPS", desc: "Smooth Rendering" },
    { icon: Cpu, label: "Real-time", desc: "Instant Processing" },
    { icon: Sparkles, label: "AI Narration", desc: "Smart Scripts" },
  ];

  return (
    <section className="py-12 border-t border-border/30 relative overflow-hidden">
      {/* Gradient accent */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-cyan-500/5" />
      
      <div className="container mx-auto px-4 relative">
        <div className="flex flex-col items-center">
          {/* Hackathon Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/20 to-cyan-500/20 border border-primary/30 mb-6">
            <div className="relative">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <div className="absolute inset-0 blur-sm">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            </div>
            <span className="text-sm font-medium bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
              Built for Google AI Hackathon 2025
            </span>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6">
            {features.map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-3 px-4 py-2 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md hover:shadow-primary/5 transition-all duration-300 group"
              >
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center group-hover:from-primary/30 group-hover:to-cyan-500/30 transition-colors">
                  <feature.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="text-left">
                  <span className="font-semibold text-sm block">{feature.label}</span>
                  <span className="text-xs text-muted-foreground">{feature.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
