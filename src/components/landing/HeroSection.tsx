import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  FolderOpen,
  Link2,
  MessageSquareText,
  Network,
  Upload,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildFolderUploadPayload,
  clearFolderUploadSession,
  loadFolderUploadSession,
  resolveRepoSourceFromInput,
  saveFolderUploadSession,
  type FolderUploadPayload,
} from "@/lib/projectSource";
import { cn } from "@/lib/utils";

const LANES = [
  {
    id: "walkthrough",
    title: "Walkthrough",
    description: "A clean scene-by-scene code tour.",
    icon: Workflow,
    accent: "bg-sky-100 text-sky-700",
  },
  {
    id: "graph",
    title: "Graph",
    description: "Dependency context without the noise.",
    icon: Network,
    accent: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "qa",
    title: "Repo Q&A",
    description: "Ask focused questions against saved repo context.",
    icon: MessageSquareText,
    accent: "bg-indigo-100 text-indigo-700",
  },
  {
    id: "agent-ops",
    title: "Agent Ops",
    description: "Agent-grade repo automation with clearer review and lower token waste.",
    icon: WandSparkles,
    accent: "bg-amber-100 text-amber-700",
  },
] as const;

const METRICS = [
  { value: "Fast", label: "Repository intake" },
  { value: "Clear", label: "Guided walkthroughs" },
  { value: "Lean", label: "Prompt context" },
];

export const HeroSection = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [repoInput, setRepoInput] = useState("");
  const [quickStartError, setQuickStartError] = useState("");
  const [uploadedFolder, setUploadedFolder] = useState<FolderUploadPayload | null>(null);
  const [isLaunchingRepo, setIsLaunchingRepo] = useState(false);
  const [isPreparingFolder, setIsPreparingFolder] = useState(false);

  useEffect(() => {
    const storedFolder = loadFolderUploadSession();
    if (storedFolder) {
      setUploadedFolder(storedFolder);
    }
  }, []);

  const handleLaunchRepo = () => {
    setQuickStartError("");
    setIsLaunchingRepo(true);

    try {
      const source = resolveRepoSourceFromInput(repoInput);
      setRepoInput(source.repoUrl);
      navigate(`/processing?repo=${encodeURIComponent(source.repoUrl)}`);
    } catch (error) {
      setQuickStartError(
        error instanceof Error ? error.message : "Invalid repository URL."
      );
    } finally {
      setIsLaunchingRepo(false);
    }
  };

  const handleUseSampleRepo = () => {
    const sampleRepo = "https://github.com/vercel/next.js";
    setRepoInput(sampleRepo);
    setQuickStartError("");
    navigate(`/processing?repo=${encodeURIComponent(sampleRepo)}`);
  };

  const handleFolderBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleFolderInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;

    setQuickStartError("");
    setIsPreparingFolder(true);

    try {
      const payload = await buildFolderUploadPayload(event.target.files);
      saveFolderUploadSession(payload);
      setUploadedFolder(payload);
    } catch (error) {
      setQuickStartError(
        error instanceof Error
          ? error.message
          : "Could not prepare the uploaded folder."
      );
    } finally {
      setIsPreparingFolder(false);
      event.target.value = "";
    }
  };

  const clearPreparedFolder = () => {
    setUploadedFolder(null);
    clearFolderUploadSession();
  };

  const launchFolder = () => {
    if (!uploadedFolder) {
      setQuickStartError("Choose a folder before starting analysis.");
      return;
    }

    navigate("/processing?mode=folder");
  };

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-32">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.12]" />
      <div className="absolute left-[8%] top-[10%] h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[12%] right-[10%] h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

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

      <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="mx-auto max-w-[860px] text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
            Editorial workspace for code
          </div>
          <h1 className="gf-headline mt-4 text-3xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Curate your{" "}
            <span className="bg-[linear-gradient(135deg,#1d4ed8_0%,#0891b2_100%)] bg-clip-text text-transparent">
              codebase
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Open a repository, let NeoDevEx process the structure, then continue in Studio with a clean saved workspace.
            Layman-style prompt compression trims setup prose locally with deterministic rules while keeping code, paths, commands,
            and evidence anchors intact.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-[860px] rounded-xl gf-panel p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg bg-black/[0.03] px-4 py-1 text-foreground/72">
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
              <Input
                variant="hero"
                value={repoInput}
                placeholder="Paste repository URL (GitHub, GitLab...)"
                onChange={(event) => {
                  setRepoInput(event.target.value);
                  setQuickStartError("");
                }}
                onKeyDown={(event) =>
                  event.key === "Enter" && handleLaunchRepo()
                }
                className="h-10 border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:shadow-none"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="ghost"
                className="h-10 rounded-lg px-4 text-sm font-semibold text-foreground/76"
                disabled={isPreparingFolder}
                onClick={handleFolderBrowse}
              >
                <Upload className="h-4 w-4" />
                {uploadedFolder ? "Replace" : "Upload"}
              </Button>
              <Button
                variant="hero"
                size="lg"
                className="rounded-lg px-6"
                disabled={isLaunchingRepo}
                onClick={handleLaunchRepo}
              >
                {isLaunchingRepo ? "Opening..." : "Open Workspace"}
              </Button>
            </div>
          </div>

          {uploadedFolder ? (
            <div className="mt-4 rounded-xl gf-panel-soft p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <FolderOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {uploadedFolder.folderName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {uploadedFolder.files.length} readable files ready
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={launchFolder}>
                    Analyze folder
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" onClick={clearPreparedFolder}>
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
            <button
              type="button"
              onClick={handleUseSampleRepo}
              className="inline-flex items-center gap-2 font-semibold text-foreground/88 transition hover:text-foreground"
            >
              Try it with a sample
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {quickStartError ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {quickStartError}
            </div>
          ) : null}
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {LANES.map((lane) => (
            <article
              key={lane.title}
              id={lane.id}
              className="rounded-xl gf-panel-soft p-5 transition hover:bg-black/[0.04]"
            >
              <div className="flex h-full flex-col">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", lane.accent)}>
                  <lane.icon className="h-[18px] w-[18px]" />
                </div>
                <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">
                  {lane.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {lane.description}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {METRICS.map((metric) => (
            <div key={metric.label} className="rounded-xl gf-panel-soft px-5 py-4">
              <div className="text-xl font-semibold tracking-tight text-foreground">
                {metric.value}
              </div>
              <div className="mt-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
