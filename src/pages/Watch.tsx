import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Player } from "@remotion/player";
import { RemotionVideo } from "@/components/studio/RemotionVideo";
import { useHydrateManifest } from "@/hooks/useHydrateManifest";
import { useAuth } from "@/context/AuthContext";
import { projectsService } from "@/lib/db";
import type { VideoManifest } from "@/lib/geminiDirector";
import iconUrl from "../../icon.png";

/**
 * Watch page: /v/:videoId
 * Fetches manifest + audio from Supabase, renders player only. Auth required (AuthGate in App).
 * Per-user: only the project owner can access.
 */
const Watch = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Awaited<ReturnType<typeof projectsService.getById>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!videoId || !user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    projectsService
      .getById(videoId, user.id)
      .then((p) => {
        if (!cancelled) setProject(p);
      })
      .catch(() => {
        if (!cancelled) setProject(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [videoId, user?.id]);

  const audioMap = useMemo(() => {
    if (!project?.manifest?.scenes) return new Map<number, string>();
    const m = new Map<number, string>();
    for (const s of project.manifest.scenes) {
      if (s.audioUrl) m.set(s.id, s.audioUrl);
    }
    return m;
  }, [project?.manifest?.scenes]);

  const hydratedManifest = useHydrateManifest(project?.manifest as VideoManifest | null, 30, audioMap);
  const totalFrames = Math.max(1, hydratedManifest?.totalFrames ?? 1);
  const totalDuration = project?.manifest?.scenes?.reduce((sum, scene) => sum + (scene.duration_seconds || 0), 0) || 0;
  const durationLabel = `${Math.floor(totalDuration / 60)}:${String(totalDuration % 60).padStart(2, "0")}`;
  const studioHref = project ? `/studio?project=${project.id}` : "/studio";

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.18]" />
        <div className="relative rounded-[24px] gf-panel-glass px-8 py-7 text-center shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-[0.95rem] text-white/60">Loading private watch link...</p>
        </div>
      </div>
    );
  }

  if (!project || !project.manifest || project.status !== "ready") {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.18]" />
        <div className="relative w-full max-w-[520px] rounded-[28px] gf-panel p-8 text-center shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-200" />
          <h1 className="mt-5 text-2xl font-semibold text-white">Video not found</h1>
          <p className="mt-3 text-[0.98rem] leading-7 text-white/60">
            This video doesn't exist or you don't have access. It may have been deleted or the link is invalid.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.14]" />
      <div className="absolute left-[8%] top-[14%] h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[10%] right-[8%] h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <header className="gf-nav-shell sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[1rem] font-semibold text-white">{project.repo_name}</div>
              <div className="text-[0.9rem] text-white/42">{project.manifest.scenes.length} scenes • {durationLabel}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={studioHref}>
                <Play className="h-4 w-4" />
                Open Studio
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1440px] px-4 py-6 sm:px-6 xl:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-[28px] gf-panel p-4 shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[22px] bg-[linear-gradient(135deg,rgba(104,132,255,0.12),rgba(17,24,39,0.42),rgba(107,216,203,0.08))] px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Private watch route
                </div>
                <div className="mt-2 text-xl font-semibold text-white">Playback-ready walkthrough</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="gf-tag rounded-full px-4 py-2 text-xs font-medium">{project.manifest.scenes.length} scenes</div>
                <div className="gf-tag rounded-full px-4 py-2 text-xs font-medium">{durationLabel} runtime</div>
              </div>
            </div>

            <div className="aspect-video overflow-hidden rounded-[22px] bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              {hydratedManifest && hydratedManifest.scenes?.length > 0 && (
                <Player
                  component={RemotionVideo}
                  inputProps={{ manifest: hydratedManifest }}
                  durationInFrames={totalFrames}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  style={{ width: "100%", height: "100%" }}
                  controls
                  loop={false}
                  clickToPlay
                  acknowledgeRemotionLicense
                />
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[26px] gf-panel p-5 shadow-[0_20px_48px_rgba(8,14,30,0.24)]">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                <Sparkles className="h-4 w-4" />
                Watch summary
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-[18px] bg-white/[0.04] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/34">Project</div>
                  <div className="mt-1 text-[0.95rem] font-medium text-white">{project.repo_name}</div>
                </div>
                <div className="rounded-[18px] bg-white/[0.04] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/34">Access</div>
                  <div className="mt-1 text-[0.95rem] leading-6 text-white/66">
                    This route is protected by account ownership, so only the project owner can open it after sign-in.
                  </div>
                </div>
                <div className="rounded-[18px] bg-white/[0.04] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/34">Next step</div>
                  <div className="mt-1 text-[0.95rem] leading-6 text-white/66">
                    Use Studio to revise scenes, review graph context, or export a fresh render.
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Watch;
