import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Bot,
  FileCode2,
  FileSearch,
  Loader2,
  MessageSquare,
  Network,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildRepoQuestionSuggestions,
  investigateRepoQuestion,
  type RepoInvestigationAnswer,
} from "@/lib/repoInvestigator";
import { getCodegraphData } from "@/lib/upstreamCodegraph";
import type { GraphSubgraph } from "@/lib/graphifyQuery";
import type { GitNexusGraphData, SourceRef, VideoManifest } from "@/lib/types";
import { recordProjectMemory } from "@/lib/projectMemory";
import { runSmeReview } from "@/lib/smeAgent";

interface RepoInvestigatorProps {
  repoName: string;
  repoContent?: string;
  manifest: VideoManifest | null;
  graphData: GitNexusGraphData | null;
  onFocusFile?: (filePath: string) => void;
  /** Enables per-project memory + SME fact-checking of answers. */
  projectId?: string | null;
  /** Fired when a graphify path/explain subgraph is available. */
  onGraphPathHighlight?: (subgraph: GraphSubgraph | null) => void;
  /** Switch Studio to the Graph tab with the current path highlight. */
  onShowInGraph?: () => void;
}

const modeStyles: Record<string, string> = {
  security: "bg-rose-500/10 text-rose-700 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.16)]",
  architecture:
    "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(180,197,255,0.16)]",
  runtime:
    "bg-emerald-500/10 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.16)]",
  data: "bg-amber-500/10 text-amber-700 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.16)]",
  onboarding:
    "bg-indigo-500/10 text-indigo-700 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.16)]",
  dependencies:
    "bg-violet-500/10 text-violet-700 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.16)]",
  general: "bg-muted text-muted-foreground",
};

const confidenceStyles: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.16)]",
  medium: "bg-amber-500/10 text-amber-700 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.16)]",
  low: "bg-muted text-muted-foreground",
};

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const normalizeRepoName = (value: string) => {
  const trimmed = value.trim();
  const githubMatch = trimmed.match(/github\.com\/([^/?#]+\/[^/?#]+)/i);
  if (githubMatch?.[1]) return githubMatch[1];

  return trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/g, "");
};

const toParagraphs = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

const previewExcerpt = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n");

const formatRefLabel = (ref: SourceRef) =>
  `${ref.file_path}:${ref.start_line}-${ref.end_line}`;

export default function RepoInvestigator({
  repoName,
  repoContent,
  manifest,
  graphData,
  onFocusFile,
  projectId,
  onGraphPathHighlight,
  onShowInGraph,
}: RepoInvestigatorProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<RepoInvestigationAnswer | null>(null);
  const [history, setHistory] = useState<RepoInvestigationAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const codegraph = getCodegraphData(graphData);
  const repoDisplayName = useMemo(() => normalizeRepoName(repoName), [repoName]);
  const suggestions = useMemo(
    () => buildRepoQuestionSuggestions(repoName, manifest, graphData).slice(0, 4),
    [repoName, manifest, graphData]
  );

  const evidenceCount = manifest?.evidence_bundle?.snippet_catalog.length || 0;
  const capsuleCount = manifest?.knowledge_graph?.summary.total_capsules || 0;
  const moduleCount = codegraph?.stats.moduleCount || 0;
  const canAsk = Boolean(
    (repoContent && repoContent.trim()) ||
      evidenceCount > 0 ||
      capsuleCount > 0 ||
      graphData?.nodes.length
  );

  const conversation = useMemo(() => [...history].reverse(), [history]);
  const latestAnswer = answer ?? history[0] ?? null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, isLoading, error]);

  const handleAsk = async (nextQuestion?: string) => {
    const prompt = (nextQuestion || question).trim();
    if (!prompt || isLoading) return;

    setIsLoading(true);
    setError(null);
    if (nextQuestion) setQuestion(prompt);

    try {
      const result = await investigateRepoQuestion({
        question: prompt,
        repoName,
        repoContent,
        manifest,
        graphData,
        projectId,
      });

      if (projectId) {
        // Remember the exchange so future steps inherit it, and let the SME
        // agent fact-check the answer in the background.
        recordProjectMemory(projectId, {
          kind: "qa",
          source: "repo-qa",
          content: `Q: ${result.question} — A: ${result.answer}`,
        });
        void runSmeReview({
          projectId,
          step: "repo-qa",
          label: "Q&A answer",
          content: `Question: ${result.question}\nAnswer: ${result.answer}\nVerdict: ${result.verdict}`,
        });
      }

      setAnswer(result);
      setHistory((current) =>
        [result, ...current.filter((entry) => entry.question !== result.question)].slice(0, 8)
      );
      setQuestion("");
      onGraphPathHighlight?.(result.graph_subgraph ?? null);
    } catch (investigationError) {
      setError(
        investigationError instanceof Error
          ? investigationError.message
          : "Investigation failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[24px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-primary">Repo Q&amp;A</div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              Chat with this repository
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Scoped to <span className="font-mono text-muted-foreground">{repoDisplayName}</span>.
              Ask one precise question and get a clean, file-backed answer tied to this repo
              only.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <TinyStat icon={FileSearch} label="Evidence" value={evidenceCount} />
            <TinyStat icon={Sparkles} label="Capsules" value={capsuleCount} />
            <TinyStat icon={FileCode2} label="Modules" value={moduleCount} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-[760px] flex-col overflow-hidden rounded-[26px] bg-secondary">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            {conversation.length === 0 && !isLoading ? (
              <WelcomeState
                repoDisplayName={repoDisplayName}
                suggestions={suggestions}
                onAsk={handleAsk}
              />
            ) : (
              <div className="space-y-8">
                {conversation.map((entry, index) => (
                  <div key={entry.question} className="space-y-5">
                    <UserMessage question={entry.question} />
                    <AssistantMessage
                      answer={entry}
                      expanded={index === conversation.length - 1}
                      onAsk={handleAsk}
                      onFocusFile={onFocusFile}
                      onShowInGraph={
                        entry.graph_subgraph?.nodeLabels?.length
                          ? () => {
                              onGraphPathHighlight?.(entry.graph_subgraph ?? null);
                              onShowInGraph?.();
                            }
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {isLoading ? <AssistantLoading repoDisplayName={repoDisplayName} /> : null}

            {error ? (
              <div className="mt-6 rounded-[20px] border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-border bg-card px-4 py-4 sm:px-6">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleAsk(suggestion)}
                  className="whitespace-nowrap rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="rounded-[22px] bg-muted p-2">
              <div className="flex items-center gap-2 px-3 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Bound to {repoDisplayName}
              </div>
              <div className="flex items-end gap-3">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleAsk();
                    }
                  }}
                  placeholder={`Ask about ${repoDisplayName}...`}
                  className="min-h-[88px] w-full resize-none bg-transparent px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                />
                <Button
                  type="button"
                  onClick={() => handleAsk()}
                  disabled={!canAsk || !question.trim() || isLoading}
                  className="h-11 w-11 shrink-0 rounded-[16px] px-0"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <RailCard title="Repo scope">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-foreground">{repoDisplayName}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  Answers stay scoped to this codebase and pull from local evidence, reading
                  paths, and graph context when available.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <InfoPill>Evidenced</InfoPill>
                <InfoPill>Repo specific</InfoPill>
                <InfoPill>Chat format</InfoPill>
              </div>
            </div>
          </RailCard>

          {latestAnswer ? (
            <>
              <RailCard title="Open next">
                <div className="space-y-2">
                  {latestAnswer.focused_files.slice(0, 5).map((filePath) => (
                    <button
                      key={filePath}
                      type="button"
                      onClick={() => onFocusFile?.(filePath)}
                      className="w-full rounded-[16px] bg-muted px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
                    >
                      <div className="truncate font-mono text-xs">{filePath}</div>
                    </button>
                  ))}
                </div>
              </RailCard>

              <RailCard title="Evidence">
                <div className="space-y-3">
                  {latestAnswer.evidence.slice(0, 4).map((item) => (
                    <button
                      key={`${item.index}-${item.source_ref.file_path}-${item.source_ref.start_line}`}
                      type="button"
                      onClick={() => onFocusFile?.(item.source_ref.file_path)}
                      className="w-full rounded-[18px] bg-muted p-4 text-left transition hover:bg-black/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[11px] text-primary">
                            {formatRefLabel(item.source_ref)}
                          </div>
                          <div className="mt-2 line-clamp-3 text-xs leading-6 text-muted-foreground">
                            {previewExcerpt(item.excerpt)}
                          </div>
                        </div>
                        <div className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                          [{item.index}]
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </RailCard>

              {latestAnswer.follow_ups.length > 0 ? (
                <RailCard title="Ask next">
                  <div className="space-y-2">
                    {latestAnswer.follow_ups.slice(0, 4).map((followUp) => (
                      <button
                        key={followUp}
                        type="button"
                        onClick={() => handleAsk(followUp)}
                        className="w-full rounded-[16px] bg-muted px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
                      >
                        {followUp}
                      </button>
                    ))}
                  </div>
                </RailCard>
              ) : null}
            </>
          ) : (
            <RailCard title="Try asking">
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleAsk(suggestion)}
                    className="w-full rounded-[16px] bg-muted px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </RailCard>
          )}
        </aside>
      </div>
    </section>
  );
}

function WelcomeState({
  repoDisplayName,
  suggestions,
  onAsk,
}: {
  repoDisplayName: string;
  suggestions: string[];
  onAsk: (question: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-5 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-[#081222] shadow-[0_18px_40px_rgba(90,128,255,0.24)]">
        <Bot className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-semibold text-primary">NeoDevEx Repo Q&amp;A</div>
        <h3 className="mt-2 text-2xl font-semibold text-foreground">
          Ask anything narrow about {repoDisplayName}
        </h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          This lane behaves like a repo-dedicated chat assistant. Ask for entry points,
          auth flow, dependency hubs, storage boundaries, or the best files to read next.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onAsk(suggestion)}
            className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserMessage({ question }: { question: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-[22px] rounded-tr-[10px] bg-primary/10 px-5 py-4 text-sm leading-7 text-foreground shadow-sm">
        {question}
      </div>
    </div>
  );
}

function confidenceChipClass(confidence?: string) {
  const value = (confidence || "").toUpperCase();
  if (value === "EXTRACTED") {
    return "bg-emerald-500/15 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.28)]";
  }
  if (value === "INFERRED") {
    return "bg-amber-500/15 text-amber-700 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.28)]";
  }
  return "bg-muted text-muted-foreground";
}

function AssistantMessage({
  answer,
  expanded,
  onAsk,
  onFocusFile,
  onShowInGraph,
}: {
  answer: RepoInvestigationAnswer;
  expanded: boolean;
  onAsk: (question: string) => void;
  onFocusFile?: (filePath: string) => void;
  onShowInGraph?: () => void;
}) {
  const paragraphs = toParagraphs(answer.answer);
  const visibleFindings = expanded ? answer.findings.slice(0, 3) : answer.findings.slice(0, 1);
  const visibleTrace = expanded ? answer.trace_steps.slice(0, 8) : answer.trace_steps.slice(0, 3);
  const visibleFiles = expanded ? answer.focused_files.slice(0, 5) : answer.focused_files.slice(0, 3);
  const graphifyText = answer.graphify_text?.trim() || "";

  return (
    <div className="flex gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-[#081222] shadow-[0_18px_40px_rgba(90,128,255,0.2)]">
        <Bot className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-foreground">NeoDevEx Assistant</div>
          <Pill className={modeStyles[answer.mode] || modeStyles.general}>
            {titleCase(answer.mode)}
          </Pill>
          <Pill
            className={confidenceStyles[answer.confidence] || confidenceStyles.medium}
          >
            {titleCase(answer.confidence)} confidence
          </Pill>
          {answer.graphify_kind ? (
            <Pill className="bg-emerald-500/10 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.16)]">
              graphify {answer.graphify_kind}
            </Pill>
          ) : null}
        </div>

        <div className="rounded-[24px] rounded-tl-[10px] bg-card border border-border p-5 shadow-sm">
          <h3 className="text-xl font-semibold tracking-tight text-foreground">{answer.verdict}</h3>

          <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          {graphifyText ? (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>
                  {answer.graphify_kind === "explain" ? "Graphify explain" : "Graphify path"}
                </SectionLabel>
                {onShowInGraph ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-full px-3 text-xs"
                    onClick={onShowInGraph}
                  >
                    <Network className="h-3.5 w-3.5" />
                    Show in graph
                  </Button>
                ) : null}
              </div>
              <pre className="overflow-x-auto rounded-[16px] bg-[#0b1220] px-4 py-3 font-mono text-[12px] leading-6 text-emerald-300/95 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]">
                {graphifyText}
              </pre>
            </div>
          ) : null}

          {visibleTrace.length > 0 ? (
            <div className="mt-5">
              <SectionLabel>Trace</SectionLabel>
              <div className="mt-3 space-y-3">
                {visibleTrace.map((step, index) => {
                  const hopConfidence =
                    (step as { confidence?: string }).confidence ||
                    (/\b(EXTRACTED|INFERRED)\b/i.exec(step.summary || "")?.[1] ?? "");
                  return (
                  <div
                    key={`${step.label}-${index}`}
                    className="rounded-[18px] bg-muted p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-foreground">{step.label}</div>
                      {hopConfidence ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confidenceChipClass(hopConfidence)}`}
                        >
                          {hopConfidence}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {step.source_refs.slice(0, 3).map((ref) => (
                        <FileChip
                          key={`${step.label}-${ref.file_path}-${ref.start_line}`}
                          label={formatRefLabel(ref)}
                          onClick={() => onFocusFile?.(ref.file_path)}
                        />
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {visibleFindings.length > 0 ? (
            <div className="mt-5">
              <SectionLabel>What matters</SectionLabel>
              <div className="mt-3 space-y-3">
                {visibleFindings.map((finding) => (
                  <div
                    key={`${finding.title}-${finding.detail}`}
                    className="rounded-[18px] bg-muted p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-foreground">{finding.title}</div>
                      <SeverityPill severity={finding.severity}>
                        {titleCase(finding.severity)}
                      </SeverityPill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {visibleFiles.length > 0 ? (
            <div className="mt-5 border-t border-border pt-4">
              <SectionLabel>Files to open</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {visibleFiles.map((filePath) => (
                  <FileChip
                    key={filePath}
                    label={filePath}
                    onClick={() => onFocusFile?.(filePath)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {expanded && answer.follow_ups.length > 0 ? (
            <div className="mt-5 border-t border-border pt-4">
              <SectionLabel>Ask next</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {answer.follow_ups.slice(0, 3).map((followUp) => (
                  <button
                    key={followUp}
                    type="button"
                    onClick={() => onAsk(followUp)}
                    className="rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/18"
                  >
                    {followUp}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssistantLoading({ repoDisplayName }: { repoDisplayName: string }) {
  return (
    <div className="mt-8 flex gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-[#081222] shadow-[0_18px_40px_rgba(90,128,255,0.2)]">
        <Bot className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 rounded-[24px] rounded-tl-[10px] bg-card border border-border p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Investigating {repoDisplayName}...
        </div>
        <div className="mt-3 text-sm leading-6 text-muted-foreground">
          Pulling the strongest file evidence, graph context, and reading path for this
          question.
        </div>
      </div>
    </div>
  );
}

function TinyStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileSearch;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" />
        <span className="uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

function RailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] bg-card border border-border p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function SeverityPill({
  children,
  severity,
}: {
  children: ReactNode;
  severity: "high" | "medium" | "low";
}) {
  const className =
    severity === "high"
      ? "border-rose-300/30 bg-rose-500/10 text-rose-700"
      : severity === "medium"
        ? "border-amber-300/30 bg-amber-500/10 text-amber-700"
        : "bg-muted text-muted-foreground";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

function FileChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
    >
      {label}
    </button>
  );
}

function InfoPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
