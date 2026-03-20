import { useRef, useState } from "react";
import { GitPullRequest, Network, Pause, Play, Search } from "lucide-react";
import { Player, PlayerRef } from "@remotion/player";
import { RemotionVideo } from "@/components/studio/RemotionVideo";
import { demoVideoManifest } from "@/data/demoVideoManifest";
import { useHydrateManifest } from "@/hooks/useHydrateManifest";

const CAPABILITIES = [
  {
    icon: Play,
    title: "Walkthrough review",
    description: "Watch the generated story and jump scene by scene without leaving the workspace.",
  },
  {
    icon: Network,
    title: "Code graph context",
    description: "Keep structural visibility nearby while reviewing the repo as a system.",
  },
  {
    icon: Search,
    title: "Repo investigation",
    description: "Ask operational questions and tie answers back to concrete evidence.",
  },
  {
    icon: GitPullRequest,
    title: "Agent run review",
    description: "Inspect issue-bound patch attempts with validations and promotion controls.",
  },
] as const;

export const DemoMockup = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const playerRef = useRef<PlayerRef>(null);
  const hydratedManifest = useHydrateManifest(demoVideoManifest, 30);

  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 pb-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400/80" />
                <div className="h-3 w-3 rounded-full bg-amber-400/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
              </div>
              <div className="ml-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                workspace/gitflick/review
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
              <div className="relative aspect-video overflow-hidden">
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
                      style={{ width: "100%", height: "100%" }}
                      controls={false}
                      autoPlay={isPlaying}
                      loop
                      clickToPlay={false}
                      doubleClickToFullscreen={false}
                      spaceKeyToPlayOrPause={false}
                      acknowledgeRemotionLicense
                    />

                    <button
                      type="button"
                      onClick={() => {
                        if (!playerRef.current) return;
                        if (isPlaying) {
                          playerRef.current.pause();
                        } else {
                          playerRef.current.play();
                        }
                        setIsPlaying((current) => !current);
                      }}
                      className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {isPlaying ? "Pause demo" : "Play demo"}
                    </button>

                    <div className="absolute bottom-5 left-5 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm">
                      Live walkthrough preview
                    </div>
                    <div className="absolute bottom-5 right-5 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-medium text-white/75 backdrop-blur-sm">
                      1080p • 30 FPS
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#0f172a,#020617)]">
                    <div className="text-center text-white/80">
                      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white/90" />
                      Loading demo workspace...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Demo Workspace
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
                The output is a review surface, not just a rendered clip
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-600">
                GitFlick keeps the video artifact inside a broader workspace so teams can move from
                walkthrough to structure, questions, and issue operations without starting over.
              </p>
            </div>

            {CAPABILITIES.map((capability) => (
              <div
                key={capability.title}
                className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm"
              >
                <div className="inline-flex rounded-2xl bg-slate-100 p-2 text-slate-700">
                  <capability.icon className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{capability.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{capability.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
