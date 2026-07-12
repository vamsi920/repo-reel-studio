import { useMemo, useState, useEffect, useRef } from "react";
import {
  GitBranch,
  FileCode,
  Network,
  Layers,
  Zap,
  ChevronRight,
  Box,
  Activity,
  Database,
  Shield,
  BarChart3,
} from "lucide-react";
import type {
  RepoIntelligence,
  RepoEvidenceBundle,
  RepoKnowledgeGraph,
} from "@/lib/types";

interface Props {
  intelligence: RepoIntelligence | null;
  evidence: RepoEvidenceBundle | null;
  knowledgeGraph: RepoKnowledgeGraph | null;
  isBuilding: boolean;
  onContinue: () => void;
}

const AnimateIn = ({
  children,
  delay = 0,
  show = true,
}: {
  children: React.ReactNode;
  delay?: number;
  show?: boolean;
}) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay, show]);

  return (
    <div
      className={`transition-all duration-500 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3"
      }`}
    >
      {children}
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  accent = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "primary" | "emerald" | "amber" | "rose";
}) => {
  const accentMap = {
    primary: "text-primary bg-primary/12",
    emerald: "text-emerald-700 bg-emerald-100",
    amber: "text-amber-700 bg-amber-100",
    rose: "text-rose-700 bg-rose-100",
  };
  return (
    <div className="rounded-xl bg-black/[0.04] p-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentMap[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-lg font-semibold text-foreground">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </div>
  );
};

const ModuleCard = ({
  label,
  description,
  fileCount,
  complexity,
  isEntry,
  isHub,
  technologies,
}: {
  label: string;
  description: string;
  fileCount: number;
  complexity: "low" | "medium" | "high";
  isEntry: boolean;
  isHub: boolean;
  technologies: string[];
}) => {
  const complexityColor = {
    low: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-rose-100 text-rose-700",
  };
  return (
    <div className="group rounded-xl bg-black/[0.04] p-4 transition hover:bg-black/[0.06] shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{label}</span>
            {isEntry && (
              <span className="shrink-0 rounded-full bg-primary/14 px-2 py-0.5 text-[10px] font-medium text-primary">
                Entry
              </span>
            )}
            {isHub && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Hub
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{description}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-muted-foreground" />
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${complexityColor[complexity]}`}>
          {complexity}
        </span>
        <span className="text-[10px] text-muted-foreground">{fileCount} files</span>
        {technologies.slice(0, 2).map((tech) => (
          <span
            key={tech}
            className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {tech}
          </span>
        ))}
      </div>
    </div>
  );
};

const LanguageBar = ({ languages }: { languages: Record<string, number> }) => {
  const sorted = useMemo(() => {
    const total = Object.values(languages).reduce((s, v) => s + v, 0);
    return Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([lang, count]) => ({
        lang,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      }));
  }, [languages]);

  const colors = [
    "bg-primary",
    "bg-emerald-400",
    "bg-amber-400",
    "bg-rose-400",
    "bg-violet-400",
    "bg-cyan-400",
  ];

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06]">
        {sorted.map((item, i) => (
          <div
            key={item.lang}
            className={`${colors[i % colors.length]} transition-all duration-700`}
            style={{ width: `${item.pct}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {sorted.map((item, i) => (
          <div key={item.lang} className="flex items-center gap-1.5 text-[11px]">
            <span className={`h-2 w-2 rounded-full ${colors[i % colors.length]}`} />
            <span className="text-muted-foreground">{item.lang}</span>
            <span className="text-muted-foreground">{item.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EvidenceHealthBar = ({
  label,
  value,
  max,
  accent = "primary",
}: {
  label: string;
  value: number;
  max: number;
  accent?: string;
}) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-muted-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const ProcessFlowMini = ({
  name,
  steps,
}: {
  name: string;
  steps: Array<{ symbol_name: string; file_path: string }>;
}) => (
  <div className="rounded-lg bg-black/[0.03] p-3">
    <div className="text-xs font-medium text-muted-foreground mb-2">{name}</div>
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {steps.slice(0, 5).map((step, i) => (
        <div key={`${step.symbol_name}-${i}`} className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-black/[0.06] px-2 py-1 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
            {step.symbol_name || step.file_path.split("/").pop()}
          </span>
          {i < Math.min(steps.length, 5) - 1 && (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </div>
      ))}
      {steps.length > 5 && (
        <span className="text-[10px] text-muted-foreground shrink-0">+{steps.length - 5} more</span>
      )}
    </div>
  </div>
);

export const RepoUnderstandingDashboard = ({
  intelligence,
  evidence,
  knowledgeGraph,
  isBuilding,
  onContinue,
}: Props) => {
  const hasData = Boolean(intelligence);
  const show = hasData || isBuilding;
  const [sectionRevealed, setSectionRevealed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!hasData) return;
    intervalRef.current = setInterval(() => {
      setSectionRevealed((prev) => {
        if (prev >= 6) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, 180);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasData]);

  if (!show) return null;

  const i = intelligence;
  const ev = evidence;
  const kg = knowledgeGraph;

  const topHubFiles = i?.hub_files.slice(0, 5) ?? [];
  const topEntryFiles = i?.entry_files.slice(0, 4) ?? [];
  const maxHealth = Math.max(
    i?.evidence_health.snippet_count ?? 0,
    i?.evidence_health.important_file_count ?? 0,
    i?.evidence_health.cluster_count ?? 0,
    i?.evidence_health.process_flow_count ?? 0,
    20
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <AnimateIn delay={0} show={hasData}>
        <div className="rounded-2xl gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/14 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]">
              <Network className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-primary/80">
                Repository Intelligence
              </div>
              <h2 className="mt-0.5 text-xl font-semibold text-foreground">
                {i?.repo_name ?? "Analyzing repository..."}
              </h2>
              {i?.architecture_pattern && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {i.architecture_pattern} architecture
                  {i.technologies.length > 0 &&
                    ` — ${i.technologies.slice(0, 4).join(", ")}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </AnimateIn>

      {/* Stats row */}
      <AnimateIn delay={100} show={sectionRevealed >= 1}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={FileCode}
            label="Source Files"
            value={i?.total_source_files ?? "—"}
            sub={`of ${i?.total_files ?? 0} total`}
          />
          <StatCard
            icon={BarChart3}
            label="Lines of Code"
            value={
              (i?.total_lines ?? 0) > 1000
                ? `${((i?.total_lines ?? 0) / 1000).toFixed(1)}k`
                : String(i?.total_lines ?? 0)
            }
            accent="emerald"
          />
          <StatCard
            icon={Layers}
            label="Modules"
            value={i?.modules.length ?? "—"}
            sub={`${i?.evidence_health.cluster_count ?? 0} clusters`}
            accent="amber"
          />
          <StatCard
            icon={Activity}
            label="Process Flows"
            value={i?.evidence_health.process_flow_count ?? "—"}
            sub={`${i?.evidence_health.reading_path_count ?? 0} reading paths`}
            accent="rose"
          />
        </div>
      </AnimateIn>

      {/* Languages + Architecture bento row */}
      <AnimateIn delay={200} show={sectionRevealed >= 2}>
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Languages */}
          <div className="rounded-xl gf-panel p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Language Breakdown
            </div>
            {i?.languages && Object.keys(i.languages).length > 0 ? (
              <LanguageBar languages={i.languages} />
            ) : (
              <div className="h-12 rounded-lg bg-black/[0.03] animate-pulse" />
            )}
          </div>

          {/* Architecture + Tech */}
          <div className="rounded-xl gf-panel p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Architecture Signals
            </div>
            <div className="space-y-2">
              {i?.architecture_pattern && (
                <div className="flex items-center gap-2 rounded-lg bg-black/[0.04] px-3 py-2">
                  <Box className="h-4 w-4 text-primary/60" />
                  <span className="text-sm text-muted-foreground">{i.architecture_pattern}</span>
                </div>
              )}
              {i?.technologies.slice(0, 5).map((tech) => (
                <div
                  key={tech}
                  className="flex items-center gap-2 rounded-lg bg-black/[0.04] px-3 py-2"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-600/70" />
                  <span className="text-sm text-muted-foreground">{tech}</span>
                </div>
              ))}
              {!i?.architecture_pattern && !i?.technologies.length && (
                <div className="h-8 rounded-lg bg-black/[0.03] animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </AnimateIn>

      {/* Key Files: Entry + Hub */}
      <AnimateIn delay={300} show={sectionRevealed >= 3}>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl gf-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-4 w-4 text-primary/60" />
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Entry Points
              </div>
            </div>
            <div className="space-y-1.5">
              {topEntryFiles.map((fp) => (
                <div
                  key={fp}
                  className="flex items-center gap-2 rounded-lg bg-black/[0.04] px-3 py-2 text-xs"
                >
                  <FileCode className="h-3.5 w-3.5 text-emerald-600/70 shrink-0" />
                  <span className="font-mono text-muted-foreground truncate">{fp}</span>
                </div>
              ))}
              {topEntryFiles.length === 0 && (
                <div className="text-xs text-muted-foreground">Analyzing entry points...</div>
              )}
            </div>
          </div>

          <div className="rounded-xl gf-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-amber-600/70" />
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Hub Files
              </div>
            </div>
            <div className="space-y-1.5">
              {topHubFiles.map((fp) => (
                <div
                  key={fp}
                  className="flex items-center gap-2 rounded-lg bg-black/[0.04] px-3 py-2 text-xs"
                >
                  <Shield className="h-3.5 w-3.5 text-amber-600/70 shrink-0" />
                  <span className="font-mono text-muted-foreground truncate">{fp}</span>
                </div>
              ))}
              {topHubFiles.length === 0 && (
                <div className="text-xs text-muted-foreground">Mapping dependency hotspots...</div>
              )}
            </div>
          </div>
        </div>
      </AnimateIn>

      {/* Module map */}
      <AnimateIn delay={400} show={sectionRevealed >= 4}>
        <div className="rounded-xl gf-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Module Map
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Top-level clusters detected from the code graph
              </p>
            </div>
            {i?.modules && i.modules.length > 6 && (
              <span className="text-[11px] text-muted-foreground">
                {i.modules.length} total
              </span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(i?.modules ?? []).slice(0, 6).map((mod) => (
              <ModuleCard
                key={mod.id}
                label={mod.label}
                description={mod.description}
                fileCount={mod.file_paths.length}
                complexity={mod.complexity}
                isEntry={mod.is_entry}
                isHub={mod.is_hub}
                technologies={mod.technologies}
              />
            ))}
            {(!i?.modules || i.modules.length === 0) && (
              <>
                <div className="h-24 rounded-xl bg-black/[0.03] animate-pulse" />
                <div className="h-24 rounded-xl bg-black/[0.03] animate-pulse" />
              </>
            )}
          </div>
        </div>
      </AnimateIn>

      {/* Process flows */}
      {ev && ev.process_flows.length > 0 && (
        <AnimateIn delay={500} show={sectionRevealed >= 5}>
          <div className="rounded-xl gf-panel p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Detected Execution Flows
            </div>
            <div className="space-y-2">
              {ev.process_flows.slice(0, 3).map((flow, idx) => (
                <ProcessFlowMini
                  key={flow.id ?? idx}
                  name={flow.name}
                  steps={flow.steps}
                />
              ))}
            </div>
          </div>
        </AnimateIn>
      )}

      {/* Evidence health */}
      <AnimateIn delay={600} show={sectionRevealed >= 6}>
        <div className="rounded-xl gf-panel p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">
            Evidence Coverage
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <EvidenceHealthBar
              label="Code Snippets"
              value={i?.evidence_health.snippet_count ?? 0}
              max={maxHealth}
            />
            <EvidenceHealthBar
              label="Important Files"
              value={i?.evidence_health.important_file_count ?? 0}
              max={maxHealth}
            />
            <EvidenceHealthBar
              label="Clusters"
              value={i?.evidence_health.cluster_count ?? 0}
              max={maxHealth}
            />
            <EvidenceHealthBar
              label="Facts Extracted"
              value={i?.evidence_health.fact_count ?? 0}
              max={maxHealth}
            />
          </div>
        </div>
      </AnimateIn>

      {/* Continue CTA */}
      {hasData && !isBuilding && (
        <AnimateIn delay={700} show={sectionRevealed >= 6}>
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onContinue}
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(104,132,255,0.2)] transition hover:shadow-[0_12px_32px_rgba(104,132,255,0.3)] hover:scale-[1.02] active:scale-[0.98]"
            >
              Continue to Onboarding
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </AnimateIn>
      )}
    </div>
  );
};
