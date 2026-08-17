import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Brain,
  Check,
  Clipboard,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  buildMemoryContextBlock,
  clearProjectMemory,
  deleteProjectMemoryEntry,
  getProjectMemory,
  recordProjectMemory,
  setProjectMemoryEntryPinned,
  subscribeProjectMemory,
  type ProjectMemoryEntry,
  type ProjectMemoryKind,
} from "@/lib/projectMemory";
import { cn } from "@/lib/utils";

const KINDS: Array<{ value: ProjectMemoryKind; label: string }> = [
  { value: "decision", label: "Decision" },
  { value: "requirement", label: "Requirement" },
  { value: "fact", label: "Fact" },
  { value: "qa", label: "Q&A" },
  { value: "sme", label: "SME finding" },
  { value: "event", label: "Event" },
];

const KIND_STYLES: Record<ProjectMemoryKind, string> = {
  decision: "bg-sky-50 text-sky-700",
  requirement: "bg-violet-50 text-violet-700",
  fact: "bg-emerald-50 text-emerald-700",
  qa: "bg-amber-50 text-amber-700",
  sme: "bg-rose-50 text-rose-700",
  event: "bg-slate-100 text-slate-600",
};

export function ProjectMemoryPanel({ projectId }: { projectId: string | null | undefined }) {
  const [entries, setEntries] = useState<ProjectMemoryEntry[]>([]);
  const [kind, setKind] = useState<ProjectMemoryKind>("decision");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pinned" | ProjectMemoryKind>("all");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setEntries([]);
      return;
    }
    setEntries(getProjectMemory(projectId));
    return subscribeProjectMemory(projectId, setEntries);
  }, [projectId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...entries]
      .reverse()
      .filter((entry) => {
        const matchesFilter =
          filter === "all" ? true : filter === "pinned" ? entry.pinned : entry.kind === filter;
        const matchesQuery =
          !needle || `${entry.content} ${entry.source} ${entry.kind}`.toLowerCase().includes(needle);
        return matchesFilter && matchesQuery;
      });
  }, [entries, filter, query]);

  if (!projectId) {
    return (
      <section className="gf-panel rounded-2xl p-8">
        <Brain className="h-6 w-6 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Save this project to enable memory</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Project memory is scoped to a saved workspace so agents can reliably reuse it.
        </p>
      </section>
    );
  }

  const addEntry = () => {
    const entry = recordProjectMemory(projectId, {
      kind,
      content,
      source: "user",
      pinned: kind === "decision" || kind === "requirement",
    });
    if (!entry) return;
    setContent("");
    toast({ title: "Saved to project memory", description: "Agents will receive this context on future work." });
  };

  const copyContext = async () => {
    const context = buildMemoryContextBlock(projectId, { maxChars: 12000 });
    if (!context) return;
    await navigator.clipboard.writeText(context);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="space-y-4" aria-labelledby="project-memory-title">
      <header className="gf-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Brain className="h-4 w-4" />
              Shared agent context
            </div>
            <h1 id="project-memory-title" className="mt-2 text-2xl font-semibold tracking-tight">
              Project memory
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Curate the requirements, decisions, facts, and findings every agent should carry forward.
              Pinned items lead the context sent to AI steps.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void copyContext()} disabled={entries.length === 0}>
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied ? "Copied" : "Copy AI context"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-muted-foreground" disabled={entries.length === 0}>
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear this project’s memory?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Agents will lose all accumulated requirements, decisions, findings, and activity context. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearProjectMemory(projectId)}>Clear memory</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="mt-6 grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_auto]">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as ProjectMemoryKind)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Memory type"
          >
            {KINDS.slice(0, 3).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <Input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addEntry()}
            placeholder="Add a durable decision, requirement, or fact…"
            aria-label="Memory content"
          />
          <Button onClick={addEntry} disabled={!content.trim()}>
            <Plus className="h-4 w-4" />
            Add memory
          </Button>
        </div>
      </header>

      <div className="gf-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter memory">
            {[
              { value: "all", label: `All ${entries.length}` },
              { value: "pinned", label: `Pinned ${entries.filter((entry) => entry.pinned).length}` },
              { value: "decision", label: "Decisions" },
              { value: "requirement", label: "Requirements" },
              { value: "fact", label: "Facts" },
              { value: "event", label: "Activity" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value as typeof filter)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === item.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search memory" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-4 rounded-xl bg-muted/70 px-6 py-12 text-center">
            <Brain className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {entries.length === 0 ? "No project memory yet" : "No entries match this view"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {entries.length === 0 ? "Add a decision above or keep working—Studio records useful context automatically." : "Try a different filter or search term."}
            </p>
          </div>
        ) : (
          <ol className="mt-4 divide-y divide-border/80">
            {filtered.map((entry) => (
              <li key={entry.id} className="group flex gap-3 py-4 first:pt-2 last:pb-1">
                <button
                  type="button"
                  onClick={() => setProjectMemoryEntryPinned(projectId, entry.id, !entry.pinned)}
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    entry.pinned ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                  aria-label={entry.pinned ? "Unpin memory" : "Pin memory"}
                >
                  {entry.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", KIND_STYLES[entry.kind])}>
                      {entry.kind}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {entry.source} · {formatDistanceToNowStrict(new Date(entry.created_at), { addSuffix: true })}
                    </span>
                    {entry.pinned ? <span className="text-[11px] font-medium text-primary">Pinned</span> : null}
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-foreground/85">{entry.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteProjectMemoryEntry(projectId, entry.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Delete memory"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export default ProjectMemoryPanel;
