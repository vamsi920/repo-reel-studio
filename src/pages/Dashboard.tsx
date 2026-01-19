import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Clock, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/context/AuthContext";
import { projectsService, formatDuration, extractRepoName, type Project } from "@/lib/db";
import { toast } from "@/hooks/use-toast";

const ProjectCard = ({
  project,
  onSelect,
}: {
  project: Project;
  onSelect: (project: Project) => void;
}) => {
  const duration = formatDuration(project.duration_seconds);
  
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
            {project.repo_name.split("/")[1] || project.repo_name}
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
          ) : project.status === "processing" ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-processing/20 text-processing text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/20 text-destructive text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
              Error
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <CardContent className="p-4">
        <div className="min-w-0">
          <h3 className="font-medium text-sm truncate">{project.repo_name}</h3>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {duration}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const activeProjectRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const activeProject = useMemo(() => {
    return projects.find((p) => p.status === "ready") || null;
  }, [projects]);

  // Load projects from Supabase
  useEffect(() => {
    if (!user?.id) return;

    const loadProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const data = await projectsService.getAll(user.id);
        setProjects(data);
      } catch (error) {
        console.error('Failed to load projects:', error);
        toast({
          title: 'Failed to load projects',
          description: 'Could not fetch your projects. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingProjects(false);
      }
    };

    loadProjects();
  }, [user?.id]);

  // Get user's first name for greeting
  const userName = useMemo(() => {
    if (user?.user_metadata?.full_name) {
      const firstName = user.user_metadata.full_name.split(' ')[0];
      return firstName;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'there';
  }, [user]);

  // Get greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const validateAndCleanUrl = (url: string): string | null => {
    let cleanUrl = url.trim();
    
    if (/^[\w-]+\/[\w-]+$/.test(cleanUrl)) {
      cleanUrl = `https://github.com/${cleanUrl}`;
    }
    
    try {
      const parsed = new URL(cleanUrl);
      
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        setUrlError("URL must use http or https protocol");
        return null;
      }
      
      if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") {
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
    
    if (cleanedUrl && user?.id) {
      const encodedRepo = encodeURIComponent(cleanedUrl);
      navigate(`/processing?repo=${encodedRepo}`);
    }
  };

  const handleProjectSelect = (project: Project) => {
    if (project.status === 'ready' && project.manifest) {
      // Store manifest in session storage for Studio (backward compatibility)
      sessionStorage.setItem('video-manifest', JSON.stringify(project.manifest));
      sessionStorage.setItem('repo-url', project.repo_url);
      sessionStorage.setItem('project-id', project.id);
      // Navigate with project ID in URL
      navigate(`/studio?project=${project.id}`);
    } else {
      toast({
        title: 'Project not ready',
        description: project.status === 'processing' 
          ? 'This project is still being processed. Please wait.'
          : 'This project encountered an error. Please try generating again.',
        variant: 'destructive',
      });
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
          <h1 className="text-2xl font-bold mb-1">{greeting}, {userName}.</h1>
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
                  {activeProject.repo_name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDuration(activeProject.duration_seconds)} · Ready to edit
                </p>
              </div>
              <Button size="lg" onClick={() => activeProject && handleProjectSelect(activeProject)}>
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
                Create New Video
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

        {/* Projects List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Your Projects</h2>

          {isLoadingProjects ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : projects.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground mb-4">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first video by entering a GitHub repository URL above.
              </p>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onSelect={(selected) => {
                    handleProjectSelect(selected);
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
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
