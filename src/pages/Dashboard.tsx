import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ElementType,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowRight,
  Clock3,
  FileCode2,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  Loader2,
  Network,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  formatDuration,
  projectsService,
  type Project,
} from "@/lib/db";
import { syncProjectWorkspaceToSession } from "@/lib/projectSession";
import {
  buildFolderUploadPayload,
  clearFolderUploadSession,
  extractRepoNameFromSource,
  getProjectSourceType,
  resolveRepoSourceFromInput,
  saveFolderUploadSession,
  type FolderUploadPayload,
} from "@/lib/projectSource";
import { cn } from "@/lib/utils";
import { listWorkspaceVideoEntries } from "@/lib/videoWorkspace";

type StatusFilter = "all" | Project["status"];

type ProjectStats = {
  sceneCount: number;
  audioCount: number;
  filesAnalyzed: number;
  graphNodes: number;
  capsuleCount: number;
  technologies: string[];
  architecture: string;
  lastUpdatedLabel: string;
};

const STATUS_META: Record<Project["status"], { label: string; className: string }> = {
  ready: {
    label: "Ready",
    className: "bg-emerald-300/10 text-emerald-200",
  },
  processing: {
    label: "Processing",
    className: "bg-primary/12 text-primary",
  },
  error: {
    label: "Needs Attention",
    className: "bg-rose-300/10 text-rose-200",
  },
};

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "error", label: "Needs Attention" },
];

function getProjectDisplayName(project: Project) {
  return (
    project.repo_name ||
    extractRepoNameFromSource(project.repo_url) ||
    project.title.replace(/\s*-\s*Video Walkthrough$/i, "") ||
    "Untitled Project"
  );
}

function getProjectStats(project: Project): ProjectStats {
  const manifestKnowledge = project.manifest?.knowledge_graph;
  const storedKnowledge = project.repo_knowledge_graph;
  const knowledgeGraph = storedKnowledge || manifestKnowledge || null;
  const graphNodes =
    project.graph_node_count ||
    project.graph_data?.nodes?.length ||
    knowledgeGraph?.summary.total_nodes ||
    0;

  return {
    sceneCount: project.manifest?.scenes?.length || 0,
    audioCount:
      project.manifest?.scenes?.filter((scene) => Boolean(scene.audioUrl)).length ||
      0,
    filesAnalyzed:
      project.ingestion_stats?.includedFiles ||
      project.manifest?.repo_files?.length ||
      0,
    graphNodes,
    capsuleCount: knowledgeGraph?.summary.total_capsules || 0,
    technologies:
      knowledgeGraph?.summary.technologies ||
      project.graph_data?.summary?.keyTechnologies ||
      [],
    architecture:
      knowledgeGraph?.summary.architecture ||
      project.graph_data?.summary?.architecturePattern ||
      "Architecture summary becomes available after analysis completes.",
    lastUpdatedLabel: formatDistanceToNowStrict(new Date(project.updated_at), {
      addSuffix: true,
    }),
  };
}

function getWorkspaceReadyVideoCount(project: Project) {
  return listWorkspaceVideoEntries(project.manifest).filter((video) => video.ready).length;
}

function hasPlayableWorkspaceVideo(project: Project) {
  return getWorkspaceReadyVideoCount(project) > 0;
}

const ProjectCard = ({
  project,
  isSelected,
  onSelect,
  onSync,
}: {
  project: Project;
  isSelected: boolean;
  onSelect: (projectId: string) => void;
  onSync: (project: Project) => void;
}) => {
  const stats = getProjectStats(project);
  const sourceType = getProjectSourceType(project.repo_url);
  const readyVideoCount = getWorkspaceReadyVideoCount(project);

  return (
    <Card
      variant="interactive"
      className={cn(
        "rounded-[22px] gf-panel-soft shadow-none transition-all hover:bg-[rgba(27,36,58,0.96)]",
        isSelected && "ring-1 ring-primary/40"
      )}
      onClick={() => onSelect(project.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">
              {getProjectDisplayName(project)}
            </p>
            <p className="mt-1.5 text-xs text-white/45">
              Updated {stats.lastUpdatedLabel}
            </p>
          </div>
          <Badge className={STATUS_META[project.status].className} variant="outline">
            {STATUS_META[project.status].label}
          </Badge>
        </div>

        <p className="mt-3 truncate font-mono text-[11px] text-white/36">
          {project.repo_url}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary" className="capitalize">
            {sourceType === "folder" ? "Folder Upload" : sourceType}
          </Badge>
          {stats.sceneCount > 0 ? <Badge variant="outline">{stats.sceneCount} scenes</Badge> : null}
          {readyVideoCount > 0 ? <Badge variant="outline">{readyVideoCount} videos</Badge> : null}
          {stats.graphNodes > 0 ? <Badge variant="outline">{stats.graphNodes} graph nodes</Badge> : null}
          {stats.audioCount > 0 ? <Badge variant="outline">{stats.audioCount} audio</Badge> : null}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onSync(project);
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Sync
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const SummaryStatCard = ({
  icon: Icon,
  label,
  value,
  description,
  accentClass,
}: {
  icon: ElementType;
  label: string;
  value: string;
  description: string;
  accentClass: string;
}) => (
  <div className="rounded-[20px] gf-panel-soft p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">{label}</div>
        <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
        <p className="mt-2 text-xs leading-5 text-white/46">{description}</p>
      </div>
      <div className={cn("rounded-2xl p-2", accentClass)}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

const WorkspaceMetricTile = ({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail: string;
}) => (
  <div className="rounded-[18px] bg-white/[0.04] p-3">
    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
      <Icon className="h-4 w-4" />
      {label}
    </div>
    <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    <p className="mt-1 text-xs leading-5 text-white/52">{detail}</p>
  </div>
);

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [quickStartError, setQuickStartError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [isLaunchingRepo, setIsLaunchingRepo] = useState(false);
  const [isPreparingFolder, setIsPreparingFolder] = useState(false);
  const [uploadedFolder, setUploadedFolder] = useState<FolderUploadPayload | null>(null);
  const [folderProjectId, setFolderProjectId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const loadProjects = useCallback(async () => {
    if (!user?.id) return;

    setIsLoadingProjects(true);
    try {
      const data = await projectsService.getDashboardProjects(user.id);
      setProjects(data);
    } catch (error) {
      console.error("Failed to load projects:", error);
      toast({
        title: "Failed to load projects",
        description: "Could not fetch your saved workspaces from Supabase.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingProjects(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const userName = useMemo(() => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(" ")[0];
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "there";
  }, [user]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesStatus =
        statusFilter === "all" ? true : project.status === statusFilter;
      const haystack = [
        getProjectDisplayName(project),
        project.title,
        project.repo_url,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search.trim()
        ? true
        : haystack.includes(search.trim().toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [projects, search, statusFilter]);

  const selectedProjectId = searchParams.get("project");
  const selectedProject = useMemo(() => {
    if (!filteredProjects.length) return null;
    if (selectedProjectId) {
      return (
        projects.find((project) => project.id === selectedProjectId) ||
        filteredProjects[0]
      );
    }
    return filteredProjects[0];
  }, [filteredProjects, projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject && selectedProjectId) {
      const next = new URLSearchParams(searchParams);
      next.delete("project");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedProject, selectedProjectId, setSearchParams]);

  const summary = useMemo(() => {
    const readyCount = projects.filter((project) => project.status === "ready").length;
    const processingCount = projects.filter((project) => project.status === "processing").length;
    const totalDuration = projects.reduce(
      (sum, project) => sum + (project.duration_seconds || 0),
      0
    );
    const totalGraphNodes = projects.reduce(
      (sum, project) => sum + getProjectStats(project).graphNodes,
      0
    );

    return {
      totalProjects: projects.length,
      readyCount,
      processingCount,
      totalDuration,
      totalGraphNodes,
    };
  }, [projects]);

  const selectProject = (projectId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("project", projectId);
    setSearchParams(next, { replace: true });
  };

  const openProjectInStudio = (project: Project) => {
    if (!project.manifest || !hasPlayableWorkspaceVideo(project)) {
      toast({
        title: "Workspace not ready",
        description:
          "This workspace has a planner but no generated video yet. Open processing to create the master or module videos first.",
        variant: "destructive",
      });
      return;
    }

    syncProjectWorkspaceToSession(project);
    navigate(`/studio?project=${project.id}`);
  };

  const openProjectPlayer = (project: Project) => {
    if (!project.manifest?.scenes?.length) {
      toast({
        title: "Master video not ready",
        description:
          "The watch route currently opens the master video only. Use Studio to open module videos.",
        variant: "destructive",
      });
      return;
    }
    navigate(`/v/${project.id}`);
  };

  const openProjectProcessing = (project: Project) => {
    const sourceType = getProjectSourceType(project.repo_url);
    if (sourceType === "folder") {
      toast({
        title: "Upload the folder again",
        description:
          "Folder re-processing needs a fresh upload in this browser session. The saved workspace is still available in Studio.",
      });
      return;
    }

    navigate(
      `/processing?project=${project.id}&repo=${encodeURIComponent(project.repo_url)}`
    );
  };

  const openProjectSync = (project: Project) => {
    const sourceType = getProjectSourceType(project.repo_url);
    if (sourceType === "folder") {
      toast({
        title: "Folder workspaces can't sync",
        description:
          "Folder uploads do not have an upstream remote to sync. Upload the folder again when the local source changes.",
      });
      return;
    }

    navigate(
      `/processing?project=${project.id}&repo=${encodeURIComponent(project.repo_url)}&sync=1`
    );
  };

  const launchRepo = async () => {
    setQuickStartError("");
    setIsLaunchingRepo(true);

    try {
      const source = resolveRepoSourceFromInput(repoInput);
      setRepoInput(source.repoUrl);

      const existingProject = user?.id
        ? await projectsService.getByRepoUrl(source.repoUrl, user.id)
        : null;

      if (existingProject?.status === "ready" && existingProject.manifest) {
        selectProject(existingProject.id);
        openProjectInStudio(existingProject);
        return;
      }

      clearFolderUploadSession();
      const processingUrl = existingProject
        ? `/processing?project=${existingProject.id}&repo=${encodeURIComponent(
            source.repoUrl
          )}`
        : `/processing?repo=${encodeURIComponent(source.repoUrl)}`;
      navigate(processingUrl);
    } catch (error) {
      setQuickStartError(
        error instanceof Error ? error.message : "Invalid repository URL."
      );
    } finally {
      setIsLaunchingRepo(false);
    }
  };

  const prepareFolder = async (files: FileList | File[]) => {
    setQuickStartError("");
    setIsPreparingFolder(true);

    try {
      const payload = await buildFolderUploadPayload(files);
      saveFolderUploadSession(payload);
      setUploadedFolder(payload);

      const existingProject = user?.id
        ? await projectsService.getByRepoUrl(payload.repoUrl, user.id)
        : null;

      if (existingProject) {
        selectProject(existingProject.id);
      }

      if (existingProject?.status === "ready" && existingProject.manifest) {
        openProjectInStudio(existingProject);
        return;
      }

      setFolderProjectId(existingProject?.id || null);
    } catch (error) {
      setUploadedFolder(null);
      setFolderProjectId(null);
      setQuickStartError(
        error instanceof Error
          ? error.message
          : "Could not prepare the uploaded folder."
      );
    } finally {
      setIsPreparingFolder(false);
    }
  };

  const handleFolderBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleFolderInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      await prepareFolder(event.target.files);
      event.target.value = "";
    }
  };

  const launchFolder = () => {
    if (!uploadedFolder) {
      setQuickStartError("Choose a folder before starting analysis.");
      return;
    }

    const processingUrl = folderProjectId
      ? `/processing?mode=folder&project=${folderProjectId}`
      : "/processing?mode=folder";
    navigate(processingUrl);
  };

  const clearPreparedFolder = () => {
    setUploadedFolder(null);
    setFolderProjectId(null);
    clearFolderUploadSession();
  };

  const selectedStats = selectedProject ? getProjectStats(selectedProject) : null;
  const selectedSourceType = selectedProject
    ? getProjectSourceType(selectedProject.repo_url)
    : "unknown";
  const canOpenStudio = Boolean(
    selectedProject?.manifest && hasPlayableWorkspaceVideo(selectedProject)
  );

  return (
    <div className="flex min-h-screen w-full bg-transparent">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-6 p-4 sm:p-6">
          <header className="overflow-hidden rounded-[24px] gf-panel p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
              Workspaces
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              {greeting}, {userName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">
              Start a new analysis or reopen a saved repo workspace.
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-3">
            <SummaryStatCard
              icon={LayoutGrid}
              label="Workspaces"
              value={`${summary.totalProjects}`}
              description="Saved in your account"
              accentClass="bg-primary/14 text-primary"
            />
            <SummaryStatCard
              icon={Video}
              label="Ready"
              value={`${summary.readyCount}`}
              description="Ready to open in Studio"
              accentClass="bg-emerald-300/12 text-emerald-200"
            />
            <SummaryStatCard
              icon={RefreshCw}
              label="Processing"
              value={`${summary.processingCount}`}
              description="Still running"
              accentClass="bg-amber-300/12 text-amber-200"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_390px]">
            <div className="space-y-6">
              <div className="overflow-hidden rounded-[24px] gf-panel">
                <div className="px-5 py-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/14 p-2 text-primary">
                      <WandSparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
                        Quick Start
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-white">
                        Launch a workspace
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-white/56">
                        Start from a repository URL or a local folder.
                      </p>
                    </div>
                  </div>
                  <Tabs defaultValue="repo" className="w-full">
                    <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg bg-white/[0.05] p-1">
                      <TabsTrigger value="repo" className="rounded-md">
                        Git Repository
                      </TabsTrigger>
                      <TabsTrigger value="folder" className="rounded-md">
                        Folder Upload
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="repo" className="mt-4 space-y-4">
                      <div className="rounded-lg bg-white/[0.04] p-4">
                        <div className="flex flex-col gap-3 lg:flex-row">
                          <Input
                            variant="hero"
                            value={repoInput}
                            placeholder="Paste https://github.com/user/repo or user/repo"
                            onChange={(event) => {
                              setRepoInput(event.target.value);
                              setQuickStartError("");
                            }}
                            onKeyDown={(event) =>
                              event.key === "Enter" && void launchRepo()
                            }
                          />
                          <Button
                            variant="hero"
                            size="lg"
                            disabled={isLaunchingRepo}
                            onClick={() => void launchRepo()}
                          >
                            {isLaunchingRepo ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRight className="h-4 w-4" />
                            )}
                            Open Workspace
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="folder" className="mt-4 space-y-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        multiple
                        onChange={handleFolderInputChange}
                        // @ts-expect-error webkitdirectory is supported in Chromium browsers.
                        webkitdirectory=""
                        // @ts-expect-error directory is supported in Chromium browsers.
                        directory=""
                      />

                      {uploadedFolder ? (
                      <div className="rounded-lg bg-emerald-300/8 p-4">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="text-lg font-semibold text-white">
                                {uploadedFolder.folderName}
                              </div>
                              <div className="mt-1 text-sm text-white/58">
                                {uploadedFolder.files.length} readable files prepared for analysis.
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={clearPreparedFolder}>
                                <X className="h-4 w-4" />
                                Clear
                              </Button>
                              <Button size="sm" onClick={launchFolder}>
                                <FolderOpen className="h-4 w-4" />
                                Analyze Folder
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-white/[0.03] p-5 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white/[0.05] text-white">
                            <Upload className="h-6 w-6" />
                          </div>
                          <div className="mt-4 text-sm font-semibold text-white">
                            Upload a local repository folder
                          </div>
                          <p className="mt-2 text-sm leading-6 text-white/56">
                            The dashboard fingerprints uploaded folders so the same source can reopen a saved project instead of creating duplicate context.
                          </p>
                          <Button
                            variant="outline"
                            className="mt-5"
                            disabled={isPreparingFolder}
                            onClick={handleFolderBrowse}
                          >
                            {isPreparingFolder ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FolderOpen className="h-4 w-4" />
                            )}
                            Choose Folder
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  {quickStartError ? (
                    <div className="mt-4 rounded-lg border border-rose-300/18 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">
                      {quickStartError}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[24px] gf-panel">
                <div className="px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
                        Saved Workspaces
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-white">
                        Reopen a saved workspace
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-white/56">
                        Filter or search to continue where you left off.
                      </p>
                    </div>
                    <div className="relative w-full max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="pl-9"
                        placeholder="Search saved projects..."
                      />
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {FILTERS.map((filter) => (
                      <Button
                        key={filter.value}
                        variant={statusFilter === filter.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatusFilter(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>

                  {isLoadingProjects ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-sky-700" />
                    </div>
                  ) : filteredProjects.length === 0 ? (
                    <div className="rounded-[20px] bg-white/[0.04] p-10 text-center">
                      <p className="text-sm font-semibold text-white">No matching workspaces</p>
                      <p className="mt-2 text-sm text-white/56">
                        Start a new analysis above or change the current filters.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {filteredProjects.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          isSelected={selectedProject?.id === project.id}
                          onSelect={selectProject}
                          onSync={openProjectSync}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="xl:sticky xl:top-5 xl:self-start">
              <div className="overflow-hidden rounded-[24px] gf-panel">
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-white/[0.06] p-2 text-primary">
                      <GitBranch className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
                        Selected Workspace
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-white">
                        Context and next action
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-5">
                  {!selectedProject || !selectedStats ? (
                    <div className="rounded-[20px] bg-white/[0.04] p-9 text-center text-sm text-white/56">
                      Select a workspace to continue.
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-white">
                            {getProjectDisplayName(selectedProject)}
                          </h3>
                          <Badge className={STATUS_META[selectedProject.status].className} variant="outline">
                            {STATUS_META[selectedProject.status].label}
                          </Badge>
                          <Badge variant="secondary" className="capitalize">
                            {selectedSourceType === "folder" ? "Folder Upload" : selectedSourceType}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/58">
                          {selectedStats.architecture}
                        </p>
                        <div className="mt-4 rounded-[18px] bg-white/[0.04] px-4 py-3 font-mono text-[11px] text-white/52">
                          {selectedProject.repo_url}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <WorkspaceMetricTile
                          icon={Video}
                          label="Scenes"
                          value={`${selectedStats.sceneCount}`}
                          detail={formatDuration(selectedProject.duration_seconds)}
                        />
                        <WorkspaceMetricTile
                          icon={FileCode2}
                          label="Files"
                          value={`${selectedStats.filesAnalyzed}`}
                          detail="captured"
                        />
                        <WorkspaceMetricTile
                          icon={Network}
                          label="Graph"
                          value={`${selectedStats.graphNodes}`}
                          detail="nodes"
                        />
                      </div>

                      <div className="space-y-3">
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={() => openProjectInStudio(selectedProject)}
                          disabled={!canOpenStudio}
                        >
                          <Play className="h-4 w-4" />
                          {canOpenStudio ? "Continue in Studio" : "Waiting for storyboard"}
                        </Button>

                        {selectedProject.status === "ready" ? (
                          <div className="grid grid-cols-2 gap-3">
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => openProjectPlayer(selectedProject)}
                            >
                              <Video className="h-4 w-4" />
                              Open Player
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => openProjectSync(selectedProject)}
                            >
                              <RefreshCw className="h-4 w-4" />
                              Sync Repo
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => openProjectProcessing(selectedProject)}
                          >
                            <RefreshCw className="h-4 w-4" />
                            {selectedProject.status === "error" ? "Retry Analysis" : "Resume Processing"}
                          </Button>
                        )}
                      </div>

                      <div className="rounded-[20px] bg-white/[0.04] p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <Clock3 className="h-4 w-4 text-white/40" />
                          Workspace snapshot
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/56">
                          Created {formatDistanceToNowStrict(new Date(selectedProject.created_at), {
                            addSuffix: true,
                          })} and updated {selectedStats.lastUpdatedLabel}.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
