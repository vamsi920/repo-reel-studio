import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
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

const Export = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading video...</p>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No video to export</p>
          <Button asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute inset-0 bg-radial-gradient" />

      <div className="relative z-10 w-full max-w-2xl mx-auto px-4 py-16">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-8" asChild>
          <Link to="/studio">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Studio
          </Link>
        </Button>

        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-success/10 mb-4">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Video Ready!</h1>
          <p className="text-muted-foreground">
            Download your generated walkthrough video.
          </p>
        </div>

        {/* Video Info */}
        <Card variant="elevated" className="mb-8 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Terminal className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">{repoName}</h2>
                <p className="text-sm text-muted-foreground">
                  {manifest.scenes.length} scenes • {durationStr} duration
                </p>
              </div>
            </div>
            
            {/* Scene list preview */}
            <div className="bg-secondary/30 rounded-lg p-4 max-h-48 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2">Scene breakdown:</p>
              <div className="space-y-1">
                {manifest.scenes.slice(0, 8).map((scene, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-6">{i + 1}.</span>
                    <span className="truncate flex-1">{scene.title || scene.file_path}</span>
                    <span className="text-muted-foreground">{scene.duration_seconds}s</span>
                  </div>
                ))}
                {manifest.scenes.length > 8 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    ...and {manifest.scenes.length - 8} more scenes
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Export Options */}
        <div className="space-y-4">
          {/* Download Video */}
          <Card variant="interactive" className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Download Video</h3>
                  <p className="text-sm text-muted-foreground">
                    {isExporting ? "Recording in background…" : "WebM or MP4 (depends on browser)"}
                  </p>
                </div>
              </div>
              <Button onClick={downloadVideo} disabled={!hydratedManifest || isExporting}>
                <Download className="h-4 w-4 mr-2" />
                {isExporting ? "Exporting…" : "Download"}
              </Button>
            </div>
            {isExporting && statusMessage && (
              <p className="text-xs text-muted-foreground mt-3" aria-live="polite">
                {statusMessage}
              </p>
            )}
            {/* Hidden player for background recording: off-screen but full size so the canvas is laid out and capturable */}
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
          </Card>

          {/* Copy video link (unique /v/:id) */}
          {(searchParams.get("project") || sessionStorage.getItem("project-id")) && (
            <Card variant="interactive" className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Copy video link</h3>
                    <p className="text-sm text-muted-foreground">Share this link to watch the video (sign-in required)</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const pid = searchParams.get("project") || sessionStorage.getItem("project-id");
                    const url = pid ? `${window.location.origin}/v/${pid}` : "";
                    if (url) {
                      navigator.clipboard.writeText(url);
                      toast({ title: "Copied!", description: "Video link copied to clipboard." });
                    }
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy link
                </Button>
              </div>
            </Card>
          )}

          {/* Copy Narration */}
          <Card variant="interactive" className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-glow-secondary/10 flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-processing" />
                </div>
                <div>
                  <h3 className="font-medium">Copy All Narration</h3>
                  <p className="text-sm text-muted-foreground">Get full script text</p>
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
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
          </Card>

        </div>

        {/* Footer Actions */}
        <div className="flex justify-center gap-4 mt-8">
          <Button variant="outline" asChild>
            <Link to="/">
              New Video
            </Link>
          </Button>
          <Button asChild>
            <Link to="/studio">
              Back to Player
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Export;
