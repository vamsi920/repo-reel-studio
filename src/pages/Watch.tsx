import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Player } from "@remotion/player";
import { RemotionVideo } from "@/components/studio/RemotionVideo";
import { useHydrateManifest } from "@/hooks/useHydrateManifest";
import { useAuth } from "@/context/AuthContext";
import { projectsService } from "@/lib/db";
import type { VideoManifest } from "@/lib/geminiDirector";

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project || !project.manifest || project.status !== "ready") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Video not found</h1>
          <p className="text-muted-foreground mb-6">
            This video doesn't exist or you don't have access. It may have been deleted or the link is invalid.
          </p>
          <Button asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 h-12 px-4 flex items-center border-b border-border bg-card/80">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground truncate ml-2">{project.repo_name}</span>
      </header>
      <main className="flex-1 flex items-center justify-center min-h-0 p-4">
        <div className="w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden">
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
      </main>
    </div>
  );
};

export default Watch;
