import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Clock, Play, MoreVertical, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

interface Project {
  id: string;
  name: string;
  duration: string;
  status: "ready" | "processing";
  thumbnail?: string;
}

const mockProjects: Project[] = [
  { id: "1", name: "facebook/react", duration: "2m 30s", status: "ready" },
  { id: "2", name: "vercel/next.js", duration: "4m 15s", status: "ready" },
  { id: "3", name: "tailwindlabs/tailwindcss", duration: "3m 45s", status: "processing" },
  { id: "4", name: "shadcn/ui", duration: "1m 58s", status: "ready" },
  { id: "5", name: "vitejs/vite", duration: "2m 12s", status: "ready" },
  { id: "6", name: "prisma/prisma", duration: "5m 22s", status: "ready" },
];

const ProjectCard = ({
  project,
  onSelect,
}: {
  project: Project;
  onSelect: (project: Project) => void;
}) => {
  return (
    <Card
      variant="interactive"
      className="group overflow-hidden"
      onClick={() => onSelect(project)}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-secondary/50 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="font-mono text-xs text-muted-foreground">
            {project.name.split("/")[1]}
          </div>
        </div>
        
        {/* Play overlay */}
        <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
            <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
          </div>
        </div>

        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          {project.status === "ready" ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/20 text-success text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              Ready
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-processing/20 text-processing text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-medium text-sm truncate">{project.name}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {project.duration}
            </div>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const activeProjectRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const defaultActiveProject = useMemo(
    () => mockProjects.find((project) => project.status === "ready") ?? null,
    []
  );
  const [activeProject, setActiveProject] = useState<Project | null>(
    defaultActiveProject
  );

  const validateAndCleanUrl = (url: string): string | null => {
    let cleanUrl = url.trim();
    
    // If user pasted just "username/repo", convert to full GitHub URL
    if (/^[\w-]+\/[\w-]+$/.test(cleanUrl)) {
      cleanUrl = `https://github.com/${cleanUrl}`;
    }
    
    // Try to parse as URL
    try {
      const parsed = new URL(cleanUrl);
      
      // Ensure it's HTTPS
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        setUrlError("URL must use http or https protocol");
        return null;
      }
      
      // If it's a GitHub URL, validate format
      if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") {
        // GitHub URLs should be like: github.com/user/repo
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        if (pathParts.length < 2) {
          setUrlError("Invalid GitHub repository URL. Expected format: github.com/user/repo");
          return null;
        }
      }
      
      return cleanUrl;
    } catch {
      setUrlError("Invalid URL format");
      return null;
    }
  };

  const handleGenerate = () => {
    setUrlError("");
    const cleanedUrl = validateAndCleanUrl(repoUrl);
    
    if (cleanedUrl) {
      const encodedRepo = encodeURIComponent(cleanedUrl);
      navigate(`/processing?repo=${encodedRepo}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex w-full">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Welcome back, Alex.</h1>
          <p className="text-muted-foreground">
            Create a new video or continue working on your projects.
          </p>
        </div>

        {activeProject && (
          <Card
            ref={activeProjectRef}
            variant="elevated"
            className="mb-8 overflow-hidden"
          >
            <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Current Project
                </p>
                <h2 className="text-xl font-semibold mt-2">
                  {activeProject.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeProject.duration} · Ready for Phase 3
                </p>
              </div>
              <Button size="lg" onClick={() => navigate("/studio")}>
                Continue in Studio
              </Button>
            </div>
          </Card>
        )}

        {/* Quick Start */}
        <Card variant="elevated" className="mb-8 overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-primary/5 to-transparent">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Quick Start
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    variant="hero"
                    placeholder="Paste GitHub URL or user/repo..."
                    className="flex-1"
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      setUrlError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  />
                  <Button variant="hero" size="lg" onClick={handleGenerate}>
                    Generate Video
                  </Button>
                </div>
                {urlError && (
                  <p className="text-sm text-destructive">{urlError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Examples: https://github.com/facebook/react or just facebook/react
                </p>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Recent Projects */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mockProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onSelect={(selected) => {
                  setActiveProject(selected);
                  requestAnimationFrame(() => {
                    activeProjectRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  });
                }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
