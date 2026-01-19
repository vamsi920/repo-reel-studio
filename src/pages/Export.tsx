import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  CheckCircle, 
  Download, 
  Link2, 
  Code, 
  Terminal,
  Copy,
  ArrowLeft,
  FileJson,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import type { VideoManifest } from "@/lib/geminiDirector";

const Export = () => {
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [repoUrl, setRepoUrl] = useState("");

  useEffect(() => {
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
  }, []);

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

  const downloadManifest = () => {
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repoName.replace("/", "-")}-manifest.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Downloaded!",
      description: "Manifest JSON saved to your downloads.",
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard.`,
    });
  };

  if (!manifest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No video to export</p>
          <Button asChild>
            <Link to="/">Create a Video</Link>
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
            Export your video manifest or view in the player.
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
          {/* Download Manifest */}
          <Card variant="interactive" className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileJson className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Download Manifest</h3>
                  <p className="text-sm text-muted-foreground">JSON file with all scene data</p>
                </div>
              </div>
              <Button onClick={downloadManifest}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </Card>

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

          {/* Info Card */}
          <Card className="overflow-hidden border-warning/30 bg-warning/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Info className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle className="text-base">Coming Soon: MP4 Export</CardTitle>
                  <CardDescription>Full video rendering with Remotion</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                MP4 export requires server-side rendering. For now, you can preview the video 
                in the Studio player and download the manifest for later rendering.
              </p>
            </CardContent>
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
