import { Link } from "react-router-dom";
import { 
  CheckCircle, 
  Download, 
  Link2, 
  Code, 
  Terminal,
  Copy,
  ExternalLink,
  ArrowLeft,
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const Export = () => {
  const shareUrl = "https://repo-to-reel.app/v/abc123xyz";
  const embedCode = `<iframe 
  src="${shareUrl}/embed"
  width="100%" 
  height="400" 
  frameborder="0"
  allowfullscreen
></iframe>`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard.`,
    });
  };

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
          <h1 className="text-3xl font-bold mb-2">Rendering Complete!</h1>
          <p className="text-muted-foreground">
            Your video is ready to share with the world.
          </p>
        </div>

        {/* Video Preview */}
        <Card variant="elevated" className="mb-8 overflow-hidden">
          <div className="aspect-video bg-secondary/30 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="flex items-center gap-2 mb-2 justify-center">
                  <Terminal className="h-5 w-5 text-primary" />
                  <span className="font-semibold">facebook/react</span>
                </div>
                <p className="text-sm text-muted-foreground">4:30 • 1080p</p>
              </div>
            </div>
            
            {/* Play overlay */}
            <button className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 hover:opacity-100 transition-opacity">
              <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center glow-primary">
                <Play className="h-6 w-6 text-primary-foreground ml-1" />
              </div>
            </button>
          </div>
        </Card>

        {/* Export Options */}
        <div className="space-y-4">
          {/* Download */}
          <Card variant="interactive" className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Download MP4</h3>
                  <p className="text-sm text-muted-foreground">Full quality video file</p>
                </div>
              </div>
              <Button>Download</Button>
            </div>
          </Card>

          {/* Share Link */}
          <Card variant="interactive" className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-glow-secondary/10 flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-processing" />
                </div>
                <div>
                  <h3 className="font-medium">Copy Share Link</h3>
                  <p className="text-sm text-muted-foreground font-mono truncate max-w-[200px]">
                    {shareUrl}
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => copyToClipboard(shareUrl, "Share link")}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
          </Card>

          {/* Embed */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Code className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle className="text-base">Embed in Notion</CardTitle>
                  <CardDescription>Copy this code snippet to embed anywhere</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-secondary/50 rounded-lg p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
                  <code>{embedCode}</code>
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(embedCode, "Embed code")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-center gap-4 mt-8">
          <Button variant="outline" asChild>
            <Link to="/dashboard">
              Go to Dashboard
            </Link>
          </Button>
          <Button asChild>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
              Open in New Tab
              <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Export;
