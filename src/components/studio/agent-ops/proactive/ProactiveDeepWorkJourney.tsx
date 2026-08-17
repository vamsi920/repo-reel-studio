import {
  Microscope,
  Lightbulb,
  Wrench,
  FlaskConical,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Sparkles,
  GitPullRequestArrow,
  FileCode2,
  Target,
} from "lucide-react";

import { Bot } from "lucide-react";

import type { ProactiveDeepWorkJourney as Journey } from "@/lib/proactiveAgentOps";
import { narrateProactiveStage, narrateProactiveVerdict } from "@/lib/agentNarration";
import { cn } from "@/lib/utils";

const STAGE_ICONS: Record<string, typeof Microscope> = {
  research: Microscope,
  brainstorm: Lightbulb,
  patch: Wrench,
  test: FlaskConical,
  verify: ShieldCheck,
};

const STATUS_RING: Record<string, string> = {
  done: "border-primary/60 bg-primary/15 text-primary shadow-[0_0_18px_-4px_hsl(var(--primary)/0.6)]",
  failed: "border-destructive/50 bg-destructive/10 text-destructive",
  skipped: "border-border bg-muted/30 text-muted-foreground",
  pending: "border-border bg-muted/20 text-muted-foreground",
};

function riskTone(risk: string): string {
  if (risk === "low") return "text-emerald-700 bg-emerald-400/10 border-emerald-400/20";
  if (risk === "high") return "text-rose-700 bg-rose-400/10 border-rose-400/20";
  return "text-amber-700 bg-amber-400/10 border-amber-400/20";
}

function validationTone(status: string): string {
  if (status === "passed") return "text-emerald-700 bg-emerald-400/10 border-emerald-400/20";
  if (status === "partial") return "text-amber-700 bg-amber-400/10 border-amber-400/20";
  if (status === "failed" || status === "error") return "text-rose-700 bg-rose-400/10 border-rose-400/20";
  return "text-muted-foreground bg-muted/30 border-border";
}

export type ProactiveDeepWorkJourneyProps = {
  journey: Journey;
  prReady?: boolean;
};

export function ProactiveDeepWorkJourney({ journey, prReady }: ProactiveDeepWorkJourneyProps) {
  const ready = prReady ?? journey.prReady;
  const greenAttempts = journey.attempts.filter((a) => a.validationStatus === "passed").length;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Hero verdict banner */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border p-5 transition-all",
          ready
            ? "border-primary/40 bg-gradient-to-br from-primary/15 via-card to-accent/10 shadow-[0_0_40px_-12px_hsl(var(--primary)/0.5)]"
            : "border-border bg-card",
        )}
      >
        {ready && (
          <div className="pointer-events-none absolute -right-6 -top-6 opacity-30">
            <Sparkles className="h-28 w-28 text-primary animate-pulse-glow" />
          </div>
        )}
        <div className="relative flex items-start gap-4">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border",
              ready ? STATUS_RING.done : "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            {ready ? (
              <GitPullRequestArrow className="h-6 w-6" />
            ) : (
              <CircleDashed className="h-6 w-6 animate-spin-slow" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="ame-eyebrow">Deep-work verdict</div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
              {ready ? "Verified — ready to open a PR" : "Not yet green — no PR will be opened"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {ready
                ? "Every gate passed: a real patch was produced and the full validation suite is green."
                : "The agent kept iterating but no approach passed every gate. A PR is only created once the build is fully green."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Stat label="Approaches" value={String(journey.approaches.length)} />
              <Stat
                label="Attempts"
                value={`${journey.attemptsRun}${journey.maxAttempts ? ` / ${journey.maxAttempts}` : ""}`}
              />
              <Stat label="Green builds" value={String(greenAttempts)} tone={greenAttempts > 0 ? "good" : "muted"} />
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-background/40 px-3 py-2">
              <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <p className="text-xs leading-5 text-foreground/90">{narrateProactiveVerdict(journey)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stage rail */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="ame-eyebrow mb-4">Pipeline</div>
        <ol className="flex items-stretch gap-1 overflow-x-auto pb-1">
          {journey.stages.map((stage, i) => {
            const Icon = STAGE_ICONS[stage.key] ?? CircleDashed;
            const tone = STATUS_RING[stage.status] ?? STATUS_RING.pending;
            return (
              <li key={stage.key} className="flex min-w-[7.5rem] flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <span className={cn("h-px flex-1", i === 0 ? "opacity-0" : "bg-border")} />
                  <span
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl border transition-all",
                      tone,
                    )}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    {stage.status === "done" ? (
                      <Icon className="h-5 w-5" />
                    ) : stage.status === "failed" ? (
                      <XCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5 opacity-70" />
                    )}
                  </span>
                  <span className={cn("h-px flex-1", i === journey.stages.length - 1 ? "opacity-0" : "bg-border")} />
                </div>
                <div className="mt-2 text-xs font-semibold text-foreground">{stage.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {narrateProactiveStage(stage)}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Research brief */}
      {(journey.research.summary || journey.research.targetFile) && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="ame-eyebrow mb-2 flex items-center gap-2">
            <Microscope className="h-3.5 w-3.5" /> Research
          </div>
          {journey.research.summary && (
            <p className="text-sm leading-6 text-muted-foreground">{journey.research.summary}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {journey.research.targetFile && (
              <Chip icon={<Target className="h-3 w-3" />} text={journey.research.targetFile} />
            )}
            {journey.research.existingTests.map((t) => (
              <Chip key={t} icon={<FlaskConical className="h-3 w-3" />} text={t} />
            ))}
            {journey.research.relatedFiles.slice(0, 5).map((f) => (
              <Chip key={f} icon={<FileCode2 className="h-3 w-3" />} text={f} muted />
            ))}
          </div>
          {journey.research.riskNotes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {journey.research.riskNotes.map((note) => (
                <li key={note} className="flex gap-2 text-[12px] leading-5 text-amber-700/90">
                  <span aria-hidden>▹</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Approaches considered */}
      {journey.approaches.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="ame-eyebrow mb-3 flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5" /> Approaches brainstormed
          </div>
          <div className="space-y-2">
            {journey.approaches.map((a) => {
              const isWinner = journey.selected?.title === a.title || journey.selected?.id === a.id;
              return (
                <div
                  key={a.id || a.title}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    isWinner ? "border-primary/50 bg-primary/[0.07]" : "border-border bg-background/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {isWinner && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      {a.title}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", riskTone(a.risk))}>
                        {a.risk} risk
                      </span>
                      {typeof a.score === "number" && (
                        <span className="font-mono text-[11px] text-muted-foreground">{Math.round(a.score * 100)}</span>
                      )}
                    </div>
                  </div>
                  {a.rationale && <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{a.rationale}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test-loop attempts */}
      {journey.attempts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="ame-eyebrow mb-3 flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5" /> Test loop
          </div>
          <div className="space-y-2">
            {journey.attempts.map((attempt) => (
              <div
                key={attempt.index ?? attempt.approachTitle}
                className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border font-mono text-xs text-muted-foreground">
                  {attempt.index ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{attempt.approachTitle || "Approach"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {attempt.patchPresent ? `${attempt.changedFiles ?? 0} file(s) changed` : "no patch produced"}
                  </div>
                </div>
                {attempt.prReady ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : null}
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", validationTone(attempt.validationStatus))}>
                  {attempt.validationStatus || "not run"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        tone === "good"
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-700"
          : "border-border bg-background/50 text-muted-foreground",
      )}
    >
      <span className="font-mono font-semibold text-foreground">{value}</span>
      <span className="uppercase tracking-wide">{label}</span>
    </span>
  );
}

function Chip({ icon, text, muted }: { icon: React.ReactNode; text: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]",
        muted ? "border-border bg-background/40 text-muted-foreground" : "border-primary/30 bg-primary/[0.07] text-foreground",
      )}
    >
      {icon}
      <span className="truncate font-mono">{text}</span>
    </span>
  );
}
