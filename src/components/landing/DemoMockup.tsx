import { useState, useRef } from "react";
import { Play, Code2, Mic, Layers, Wand2, Pause } from "lucide-react";
import { Player, PlayerRef } from "@remotion/player";
import { RemotionVideo } from "@/components/studio/RemotionVideo";
import { useHydrateManifest } from "@/hooks/useHydrateManifest";
import { demoVideoManifest } from "@/data/demoVideoManifest";

export const DemoMockup = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const playerRef = useRef<PlayerRef>(null);
  
  // Hydrate the demo manifest
  const hydratedManifest = useHydrateManifest(demoVideoManifest, 30);
  const capabilities = [
    {
      icon: Code2,
      title: "Syntax Highlighting",
      desc: "Beautiful code display with language detection",
    },
    {
      icon: Mic,
      title: "AI Narration",
      desc: "Intelligent AI writes engaging explanations",
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

              {/* Video Content Area - Real Remotion Player */}
              <div className="aspect-video bg-black relative overflow-hidden group">
                {hydratedManifest ? (
                  <>
                    <Player
                      ref={playerRef}
                      component={RemotionVideo}
                      inputProps={{ manifest: hydratedManifest }}
                      durationInFrames={hydratedManifest.totalFrames || 1}
                      compositionWidth={1920}
                      compositionHeight={1080}
                      fps={30}
                      style={{
                        width: "100%",
                        height: "100%",
                      }}
                      controls={false}
                      autoPlay={isPlaying}
                      loop={true}
                      clickToPlay={false}
                      doubleClickToFullscreen={false}
                      spaceKeyToPlayOrPause={false}
                      acknowledgeRemotionLicense
                    />
                    
                    {/* Pause overlay when playing */}
                    {isPlaying && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none z-10" />
                    )}
                    
                    {/* Play/Pause overlay button */}
                    <button
                      onClick={() => {
                        if (playerRef.current) {
                          if (isPlaying) {
                            playerRef.current.pause();
                          } else {
                            playerRef.current.play();
                          }
                          setIsPlaying(!isPlaying);
                        }
                      }}
                      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-20 w-20 rounded-full backdrop-blur-sm border-2 flex items-center justify-center transition-all z-20 ${
                        isPlaying 
                          ? "bg-black/40 border-white/20 opacity-0 group-hover:opacity-100 hover:bg-black/60 hover:scale-110" 
                          : "bg-black/70 border-white/30 opacity-100 hover:bg-black/80 hover:scale-110"
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="h-7 w-7 text-white ml-0.5" />
                      ) : (
                        <Play className="h-7 w-7 text-white ml-1" />
                      )}
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
                    <div className="text-center">
                      <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-slate-600 text-sm">Loading demo video...</p>
                    </div>
                  </div>
                )}

                {/* Decorative elements */}
                <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 shadow-sm z-10">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-white/90">Live Demo</span>
                </div>
                
                <div className="absolute bottom-4 right-4 text-xs text-white/70 font-mono z-10">
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
