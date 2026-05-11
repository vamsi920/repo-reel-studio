import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  GitPullRequest,
  Shield,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Animated Mission Map Preview ──────────────────────────────────

const PIPELINE_STEPS = [
  { id: "ingest", label: "Ingest", icon: "📦", color: "from-blue-500 to-blue-600", delay: 0 },
  { id: "sandbox", label: "Sandbox", icon: "🔒", color: "from-purple-500 to-purple-600", delay: 200 },
  { id: "diagnose", label: "Diagnose", icon: "🔍", color: "from-amber-500 to-amber-600", delay: 400 },
  { id: "patch", label: "Patch", icon: "⚡", color: "from-cyan-500 to-cyan-600", delay: 600 },
  { id: "validate", label: "Validate", icon: "✅", color: "from-emerald-500 to-emerald-600", delay: 800 },
  { id: "pr", label: "PR Draft", icon: "🚀", color: "from-pink-500 to-pink-600", delay: 1000 },
];

const TERMINAL_LINES = [
  "$ neodevex ingest github.com/acme/api",
  "→ Detecting stack... Node.js + TypeScript",
  "→ Building sandbox image... ████████░░ 82%",
  "→ Sandbox cached: neodevex-env/api:a8f3c2e1",
  "✓ Agent-ready environment provisioned",
  "",
  "$ neodevex run --issue 342",
  "→ Reproducing: npm test... 2 failing",
  "→ Root cause: null check in auth middleware",
  "→ Patching src/middleware/auth.ts (+8/-3)",
  "→ Validating: npm test... all 47 passing ✓",
  "→ Quality gates: lint ✓ | test ✓ | build ✓",
  "✓ Draft PR created: #343",
];

function AnimatedPipeline() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % (PIPELINE_STEPS.length + 1));
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative flex items-center justify-center gap-2 py-6">
      {PIPELINE_STEPS.map((step, idx) => {
        const isActive = idx <= activeStep;
        const isCurrent = idx === activeStep;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                "relative flex flex-col items-center gap-1.5 transition-all duration-500",
                isActive ? "opacity-100 scale-100" : "opacity-30 scale-95",
              )}
              style={{ transitionDelay: `${step.delay}ms` }}
            >
              <div
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-xl text-lg transition-all duration-300",
                  isActive
                    ? `bg-gradient-to-br ${step.color} shadow-lg`
                    : "bg-white/[0.06]",
                  isCurrent && "ring-2 ring-white/20 ring-offset-2 ring-offset-black",
                )}
              >
                {step.icon}
                {isCurrent && (
                  <span className="absolute inset-0 animate-ping rounded-xl bg-white/10" />
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wide transition-colors",
                  isActive ? "text-white/70" : "text-white/25",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div className="mx-1.5 flex items-center">
                <div
                  className={cn(
                    "h-px w-6 transition-all duration-500",
                    idx < activeStep ? "bg-white/30" : "bg-white/[0.06]",
                  )}
                />
                <div
                  className={cn(
                    "h-1 w-1 rounded-full transition-all duration-500",
                    idx < activeStep ? "bg-white/40" : "bg-white/[0.06]",
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Terminal Preview ──────────────────────────────────────────────

function TerminalPreview() {
  const [lines, setLines] = useState<string[]>([]);
  const replayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let idx = 0;
    const timer = setInterval(() => {
      if (idx < TERMINAL_LINES.length) {
        setLines((prev) => [...prev, TERMINAL_LINES[idx] ?? ""]);
        idx++;
      } else {
        replayTimeoutRef.current = setTimeout(() => {
          setLines([]);
          idx = 0;
        }, 3000);
      }
    }, 600);
    return () => {
      clearInterval(timer);
      if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/60 shadow-2xl shadow-black/40">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <span className="ml-2 text-[11px] text-white/30 font-mono">neodevex</span>
      </div>

      {/* Content */}
      <div className="p-4 font-mono text-[12px] leading-[1.8] min-h-[260px]">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={cn(
              "transition-all duration-300",
              line?.startsWith("$") && "text-cyan-400",
              line?.startsWith("→") && "text-white/50",
              line?.startsWith("✓") && "text-emerald-400 font-semibold",
              !line && "h-3",
            )}
          >
            {line}
          </div>
        ))}
        <span className="inline-block w-2 h-4 bg-white/40 animate-pulse" />
      </div>
    </div>
  );
}

// ─── Feature Pillars ───────────────────────────────────────────────

const PILLARS = [
  {
    icon: Bot,
    title: "Autonomous Bug Fixing",
    description: "OpenDevin-powered agent reproduces, diagnoses, patches, and validates — automatically.",
    accent: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: Shield,
    title: "Secure Sandboxes",
    description: "Pre-built Docker environments per repo. Agent runs in isolation with strict policy guardrails.",
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: GitPullRequest,
    title: "Auto PR Drafts",
    description: "Validated patches become draft PRs with full audit trail, test matrices, and risk scores.",
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Zap,
    title: "Mission Map",
    description: "Beautiful DAG visualization of every agent step — click to drill into evidence and logs.",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
  },
];

// ─── Main Hero ─────────────────────────────────────────────────────

export function AgenticHero() {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");

  const handleSubmit = () => {
    if (!repoUrl.trim()) return;
    const encoded = encodeURIComponent(repoUrl.trim());
    navigate(`/processing?repo=${encoded}`);
  };

  return (
    <div className="relative">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] h-[600px] w-[600px] rounded-full bg-purple-600/[0.07] blur-[120px]" />
        <div className="absolute top-[10%] right-[5%] h-[500px] w-[500px] rounded-full bg-cyan-600/[0.05] blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[40%] h-[400px] w-[400px] rounded-full bg-blue-600/[0.04] blur-[80px]" />

        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-6xl px-4 pt-32 pb-20 sm:px-6">
        {/* Headline */}
        <h1 className="mx-auto max-w-4xl text-center text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
          <span className="inline-block">Your repo&apos;s</span>{" "}
          <span className="bg-gradient-to-r from-purple-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            autonomous
          </span>{" "}
          <span className="inline-block">control plane</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-white/50">
          Label a GitHub issue <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-sm text-purple-300">neodevex</code> and
          watch an AI agent reproduce the bug, implement a fix, validate it in a sandboxed environment,
          and open a draft PR — all with a beautiful mission map of every step.
        </p>

        {/* CTA */}
        <div className="mx-auto mt-10 flex max-w-lg items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="github.com/your-org/your-repo"
              className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-white/25 focus:border-purple-500/40 focus:outline-none focus:ring-1 focus:ring-purple-500/20 transition"
            />
          </div>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition hover:shadow-purple-500/30 hover:brightness-110"
          >
            Connect
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Animated Pipeline Preview */}
        <div className="mt-16">
          <AnimatedPipeline />
        </div>

        {/* Terminal + Feature Grid */}
        <div className="mt-16 grid gap-8 lg:grid-cols-2">
          <TerminalPreview />

          <div className="grid grid-cols-2 gap-3">
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:bg-white/[0.04] hover:border-white/[0.1]"
                >
                  <div className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl", pillar.bg)}>
                    <Icon className={cn("h-4 w-4", pillar.accent)} />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-white/80">{pillar.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/40">{pillar.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── How It Works Section ──────────────────────────────────────────

const STEPS = [
  {
    number: "01",
    title: "Connect & Ingest",
    description: "Paste your GitHub repo URL. We analyze the codebase, detect the tech stack, and pre-build a Docker sandbox — cached and ready for instant agent runs.",
    visual: "ingest",
    color: "text-blue-400",
  },
  {
    number: "02",
    title: "Label & Trigger",
    description: "Add the `neodevex` label to any GitHub issue. Our webhook handler picks it up, deduplicates, and queues a BugBot run automatically.",
    visual: "trigger",
    color: "text-purple-400",
  },
  {
    number: "03",
    title: "Agent Runs Autonomously",
    description: "OpenDevin reproduces the bug, analyzes root cause, implements a minimal fix, runs the full test suite, and computes quality gates — all in an isolated sandbox.",
    visual: "run",
    color: "text-cyan-400",
  },
  {
    number: "04",
    title: "Review & Ship",
    description: "A draft PR appears with full audit trail: mission map, test matrix, risk scores, diff walkthrough, and an optional Fix Story video recap.",
    visual: "review",
    color: "text-emerald-400",
  },
];

export function HowItWorksSection() {
  return (
    <section className="relative py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-20">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-400">
            How it works
          </span>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            From issue to PR in minutes
          </h2>
          <p className="mt-4 text-lg text-white/40">
            Four steps. Fully automated. Fully auditable.
          </p>
        </div>

        <div className="space-y-16">
          {STEPS.map((step, idx) => (
            <div
              key={step.number}
              className={cn(
                "flex items-start gap-8",
                idx % 2 === 1 && "flex-row-reverse",
              )}
            >
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <span className={cn("text-3xl font-bold tabular-nums", step.color)}>
                    {step.number}
                  </span>
                  <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                </div>
                <p className="text-base leading-relaxed text-white/45 max-w-md">
                  {step.description}
                </p>
              </div>

              <div className="flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 min-h-[120px] flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <div className={cn("h-12 w-12 rounded-xl bg-white/[0.06] flex items-center justify-center")}>
                    {step.visual === "ingest" && <Terminal className="h-5 w-5 text-blue-400" />}
                    {step.visual === "trigger" && <Sparkles className="h-5 w-5 text-purple-400" />}
                    {step.visual === "run" && <Bot className="h-5 w-5 text-cyan-400" />}
                    {step.visual === "review" && <GitPullRequest className="h-5 w-5 text-emerald-400" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white/70">{step.title}</div>
                    <div className="text-xs text-white/30">Automated</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Trust & Safety Section ────────────────────────────────────────

const TRUST_ITEMS = [
  {
    icon: Shield,
    title: "Policy Guardrails",
    description: "Command allowlists, path denylists, network restrictions. Every action is policy-gated.",
  },
  {
    icon: Terminal,
    title: "Isolated Sandboxes",
    description: "Docker containers with no access to secrets. Pre-built at ingestion, destroyed after each run.",
  },
  {
    icon: Zap,
    title: "Full Audit Trail",
    description: "Every agent step is logged with timestamps, evidence, and structured timeline events.",
  },
  {
    icon: GitPullRequest,
    title: "Human-in-the-Loop",
    description: "Patches are draft PRs, never auto-merged. Approve, reject, or request changes — you're in control.",
  },
];

export function TrustSection() {
  return (
    <section className="relative py-24 border-t border-white/[0.04]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Trust & Safety
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Autonomous doesn&apos;t mean uncontrolled
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition hover:bg-white/[0.04]"
              >
                <Icon className="h-5 w-5 text-emerald-400 mb-3" />
                <h3 className="text-sm font-semibold text-white/80">{item.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/40">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── CTA Section ───────────────────────────────────────────────────

export function CtaSection() {
  const navigate = useNavigate();

  return (
    <section className="relative py-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] rounded-full bg-purple-600/[0.08] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Ready to automate your bug fixes?
        </h2>
        <p className="mt-5 text-lg text-white/45">
          Connect your repository and let BugBot handle the rest.
          Every step is transparent, auditable, and under your control.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            onClick={() => navigate("/processing")}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-purple-500/20 transition hover:shadow-purple-500/30 hover:brightness-110"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </button>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-8 py-4 text-base font-medium text-white/70 transition hover:bg-white/[0.06]"
          >
            View Docs
          </a>
        </div>
      </div>
    </section>
  );
}
