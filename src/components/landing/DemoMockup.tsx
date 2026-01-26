import { Play, Code2, Mic, Layers, Wand2 } from "lucide-react";

export const DemoMockup = () => {
  const capabilities = [
    {
      icon: Code2,
      title: "Syntax Highlighting",
      desc: "Beautiful code display with language detection",
    },
    {
      icon: Mic,
      title: "AI Narration",
      desc: "Gemini 3 writes engaging explanations",
    },
    {
      icon: Layers,
      title: "Scene Management",
      desc: "Automatic scene generation from code structure",
    },
    {
      icon: Wand2,
      title: "Smart Editing",
      desc: "Fine-tune your video in the Studio",
    },
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent" />
      
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything You Need to{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-primary bg-clip-text text-transparent">
              Create Amazing Videos
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Our AI-powered platform handles everything from code analysis to video rendering
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-16">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="group p-5 rounded-2xl bg-card/50 border border-border/50 hover:border-primary/30 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <cap.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{cap.title}</h3>
              <p className="text-sm text-muted-foreground">{cap.desc}</p>
            </div>
          ))}
        </div>

        {/* Video Preview Mockup */}
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-400/25 via-cyan-400/25 to-rose-400/20 rounded-3xl blur-2xl opacity-60" />
            
            {/* Video Frame */}
            <div className="relative bg-card rounded-2xl border border-border overflow-hidden shadow-2xl">
              {/* Browser-style header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <div className="w-3 h-3 rounded-full bg-green-500/70" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-background/50 rounded-lg px-4 py-1.5 text-xs text-muted-foreground font-mono">
                    gitflick.app/studio/your-repo
                  </div>
                </div>
              </div>

              {/* Video Content Area */}
              <div className="aspect-video bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 flex items-center justify-center relative">
                {/* Code preview background */}
                <div className="absolute inset-0">
                  <pre className="text-xs text-slate-700 p-8 font-mono leading-relaxed">
{`// Your code comes alive
export async function generateVideo(repo) {
  const analysis = await gemini.analyze(repo);
  const script = await gemini.writeScript(analysis);
  const scenes = await createScenes(script);
  
  return renderVideo(scenes);
}

// AI-powered narration
const narration = gemini.generateNarration({
  style: "professional",
  tone: "engaging",
  audience: "developers"
});`}
                  </pre>
                </div>

                {/* Play button overlay */}
                <div className="relative z-10 flex flex-col items-center gap-4">
                  <button className="h-20 w-20 rounded-full bg-gradient-to-r from-primary to-cyan-500 flex items-center justify-center hover:scale-110 transition-transform shadow-xl shadow-primary/25 group">
                    <Play className="h-8 w-8 text-white ml-1 group-hover:scale-110 transition-transform" />
                  </button>
                  <p className="text-slate-600 text-sm font-medium">
                    See GitFlick in action
                  </p>
                </div>

                {/* Decorative elements */}
                <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200/80 shadow-sm">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-slate-600">Live Preview</span>
                </div>
                
                <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono">
                  1080p • 30 FPS
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-secondary">
                <div className="h-full w-1/3 bg-gradient-to-r from-primary to-cyan-500 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
