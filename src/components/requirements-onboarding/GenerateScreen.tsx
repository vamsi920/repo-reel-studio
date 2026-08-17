// Ported from document-query-flow/src/components/onboarding/GenerateScreen.tsx,
// extended with an optional "create project" action so the generated
// BRD/FRD/Summary can hand off into a NeoDevEx project workspace.
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { saveAs } from "file-saver";
import {
  FileText,
  FileCog,
  ClipboardList,
  Download,
  ArrowLeft,
  RefreshCw,
  Loader2,
  Rocket,
} from "lucide-react";
import type { GeneratedDocs, RequirementState } from "@/lib/requirementsOnboarding/types";

type TabKey = "brd" | "frd" | "summary";

interface GenerateScreenProps {
  docs: GeneratedDocs;
  state: RequirementState;
  regenerating: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  /** NeoDevEx-specific: hand the generated requirements off into a project. */
  onCreateProject?: () => void;
  creatingProject?: boolean;
}

const TABS: { key: TabKey; label: string; icon: React.ReactNode; file: string }[] = [
  { key: "brd", label: "BRD", icon: <FileText className="h-4 w-4" />, file: "BRD" },
  { key: "frd", label: "FRD", icon: <FileCog className="h-4 w-4" />, file: "FRD" },
  {
    key: "summary",
    label: "Application Summary",
    icon: <ClipboardList className="h-4 w-4" />,
    file: "Application-Summary",
  },
];

const GenerateScreen = ({
  docs,
  state,
  regenerating,
  onBack,
  onRegenerate,
  onCreateProject,
  creatingProject,
}: GenerateScreenProps) => {
  const [tab, setTab] = useState<TabKey>("brd");
  const slug =
    (state.projectName || "project").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const current = docs[tab];

  const download = (kind: TabKey, fileLabel: string) => {
    const blob = new Blob([docs[kind]], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `${slug}-${fileLabel}.md`);
  };

  return (
    <div className="onb-root flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to interview
          </button>
          <div>
            <div className="onb-eyebrow flex items-center gap-2 text-slate-400">
              <span className="onb-pip" /> Documents ready
            </div>
            <h1 className="text-lg font-semibold text-white">
              {state.projectName || "Your project"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-white disabled:opacity-50"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerate
          </button>
          <button
            onClick={() => download(tab, TABS.find((t) => t.key === tab)!.file)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3.5 py-2 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
          >
            <Download className="h-4 w-4" /> Download {tab.toUpperCase()}
          </button>
          {onCreateProject && (
            <button
              onClick={onCreateProject}
              disabled={creatingProject}
              className="onb-btn-hud flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs"
            >
              {creatingProject ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Create project & continue
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--line)] px-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === t.key
                ? "border-cyan-400 text-cyan-200"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Document */}
      <div className="onb-scroll flex-1 overflow-y-auto px-6 py-8">
        <div className="onb-panel onb-prose onb-rise mx-auto max-w-3xl p-8">
          <ReactMarkdown>{current}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default GenerateScreen;
