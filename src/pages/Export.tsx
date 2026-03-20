import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { 
  CheckCircle, 
  Download, 
  Link2, 
  Terminal,
  Copy,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { projectsService } from "@/lib/db";
import type { VideoManifest } from "@/lib/geminiDirector";
import { Player, PlayerRef } from "@remotion/player";
import { RemotionVideo } from "@/components/studio/RemotionVideo";
import { useHydrateManifest } from "@/hooks/useHydrateManifest";
import { useDownloadVideo } from "@/hooks/useDownloadVideo";
import iconUrl from "../../icon.png";

const Export = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const playerRef = useRef<PlayerRef>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadManifest = async () => {
      setIsLoading(true);
      
      // Try to load from Supabase first
      const projectId = searchParams.get('project') || sessionStorage.getItem('project-id');
      
      if (projectId && user?.id) {
        try {
          const project = await projectsService.getById(projectId, user.id);
          if (project && project.manifest && project.status === 'ready') {
            setManifest(project.manifest as VideoManifest);
            setRepoUrl(project.repo_url);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Failed to load project:', error);
        }
      }
      
      // Fallback to session storage
      const storedManifest = sessionStorage.getItem("video-manifest");
      const storedUrl = sessionStorage.getItem("repo-url");
      
      if (storedManifest) {
        try {
          setManifest(JSON.parse(storedManifest));
        } catch {
          console.warn("Failed to parse manifest");
        }
      }
      if (storedUrl) {
        setRepoUrl(storedUrl);
      }
      
      setIsLoading(false);
    };

    loadManifest();
  }, [searchParams, user?.id]);

  const repoName = (() => {
    try {
      const url = new URL(repoUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : repoUrl;
    } catch {
      return manifest?.title || "Video";
    }
  })();

  const totalDuration = manifest?.scenes?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
  const durationStr = `${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, "0")}`;
  const projectId = searchParams.get("project") || sessionStorage.getItem("project-id");
  const studioHref = projectId ? `/studio?project=${projectId}` : "/studio";

  const audioMap = useMemo(() => {
    if (!manifest?.scenes) return new Map<number, string>();
    const m = new Map<number, string>();
    for (const s of manifest.scenes) {
      if (s.audioUrl) m.set(s.id, s.audioUrl);
    }
    return m;
  }, [manifest?.scenes]);
  const hydratedManifest = useHydrateManifest(manifest, 30, audioMap);

  const { downloadVideo, isExporting, statusMessage } = useDownloadVideo({
    playerContainerRef,
    playerRef,
    totalFrames: hydratedManifest?.totalFrames || 1,
    fps: 30,
    fileName: repoName,
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard.`,
    });
  };

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.18]" />
        <div className="relative rounded-[24px] gf-panel-glass px-8 py-7 text-center shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-[0.95rem] text-white/60">Loading export workspace...</p>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.18]" />
        <div className="relative w-full max-w-[520px] rounded-[28px] gf-panel p-8 text-center shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
          <Terminal className="mx-auto h-12 w-12 text-white/40" />
          <h1 className="mt-5 text-2xl font-semibold text-white">No video to export</h1>
          <p className="mt-3 text-[0.98rem] leading-7 text-white/60">
            The export workspace could not find a saved manifest in the current session or account.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.16]" />
      <div className="absolute left-[8%] top-[14%] h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[10%] right-[8%] h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <header className="gf-nav-shell sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:px-6 xl:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
            </div>
            <div>
              <div className="font-headline text-[1.3rem] font-semibold text-white">Export Studio</div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/34">Delivery surface</div>
            </div>
          </div>

          <Button variant="outline" size="sm" asChild>
            <Link to={studioHref}>
              <ArrowLeft className="h-4 w-4" />
              Back to Studio
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1320px] px-4 py-8 sm:px-6 xl:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[28px] gf-panel shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
              <div className="bg-[linear-gradient(135deg,rgba(104,132,255,0.12),rgba(17,24,39,0.42),rgba(107,216,203,0.08))] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-300/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Export ready
                    </div>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">Deliver the finished walkthrough</h1>
                    <p className="mt-3 max-w-2xl text-[0.98rem] leading-7 text-white/60">
                      Download the current render, copy the narration, or generate a private watch link for the saved workspace.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="gf-tag rounded-full px-4 py-2 text-xs font-medium">{manifest.scenes.length} scenes</div>
                    <div className="gf-tag rounded-full px-4 py-2 text-xs font-medium">{durationStr} runtime</div>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-4 rounded-[22px] bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-primary/12 text-primary">
                    <Terminal className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{repoName}</h2>
                    <p className="mt-1 text-sm text-white/56">
                      Generated walkthrough package ready for delivery.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4">
              <Card variant="interactive" className="rounded-[24px] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-primary/12 text-primary">
                      <Download className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">Download video</h3>
                      <p className="mt-1 text-sm text-white/56">
                        {isExporting ? "Recording in background…" : "WebM or MP4 depending on browser support."}
                      </p>
                    </div>
                  </div>
                  <Button onClick={downloadVideo} disabled={!hydratedManifest || isExporting}>
                    <Download className="h-4 w-4" />
                    {isExporting ? "Exporting…" : "Download"}
                  </Button>
                </div>
                {isExporting && statusMessage && (
                  <p className="text-xs text-white/42" aria-live="polite">
                    {statusMessage}
                  </p>
                )}
              </Card>

              {projectId ? (
                <Card variant="interactive" className="rounded-[24px] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-white/[0.06] text-primary">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">Copy watch link</h3>
                        <p className="mt-1 text-sm text-white/56">
                          Share a private watch route tied to this saved project.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const url = `${window.location.origin}/v/${projectId}`;
                        navigator.clipboard.writeText(url);
                        toast({ title: "Copied!", description: "Video link copied to clipboard." });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy link
                    </Button>
                  </div>
                </Card>
              ) : null}

              <Card variant="interactive" className="rounded-[24px] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent/12 text-accent">
                      <Copy className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">Copy all narration</h3>
                      <p className="mt-1 text-sm text-white/56">Capture the complete script for reviews or external publishing.</p>
                    </div>
                  </div>
                  <Button 
                    variant="secondary" 
                    onClick={() => {
                      const narration = manifest.scenes
                        .map((s, i) => `[Scene ${i + 1}: ${s.title || s.file_path}]\n${s.narration_text}`)
                        .join("\n\n");
                      copyToClipboard(narration, "Narration script");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy script
                  </Button>
                </div>
              </Card>
            </div>

            <div
              ref={playerContainerRef}
              aria-hidden="true"
              style={{
                position: "fixed",
                left: -9999,
                top: 0,
                width: 1920,
                height: 1080,
                opacity: 0,
                pointerEvents: "none",
                zIndex: -1,
                overflow: "hidden",
              }}
            >
              {hydratedManifest && (
                <Player
                  ref={playerRef}
                  component={RemotionVideo}
                  inputProps={{ manifest: hydratedManifest }}
                  durationInFrames={hydratedManifest.totalFrames || 1}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  style={{ width: 1920, height: 1080 }}
                  controls={false}
                  autoPlay={false}
                  loop={false}
                  clickToPlay={false}
                  doubleClickToFullscreen={false}
                  spaceKeyToPlayOrPause={false}
                  acknowledgeRemotionLicense
                />
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[26px] gf-panel p-5 shadow-[0_20px_48px_rgba(8,14,30,0.24)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                Scene breakdown
              </div>
              <div className="mt-4 max-h-[540px] space-y-2 overflow-y-auto">
                {manifest.scenes.map((scene, i) => (
                  <div
                    key={`${scene.id}-${i}`}
                    className="rounded-[18px] bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-white/70">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {scene.title || scene.file_path}
                        </div>
                        <div className="mt-1 text-xs text-white/42">{scene.duration_seconds}s</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[26px] gf-panel p-5 shadow-[0_20px_48px_rgba(8,14,30,0.24)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/36">
                Delivery notes
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-[18px] bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/62">
                  Export uses the hydrated Remotion composition from the current workspace state.
                </div>
                <div className="rounded-[18px] bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/62">
                  Private watch links remain account-protected even when shared across devices.
                </div>
                <div className="rounded-[18px] bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/62">
                  The copied narration includes scene labels so editorial review can happen outside the player.
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Export;
