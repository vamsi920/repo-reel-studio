import { useState, useMemo, useCallback } from "react";
import {
  Users,
  Target,
  LayoutGrid,
  Sparkles,
  Clock,
  ChevronRight,
  ChevronLeft,
  Check,
  Zap,
  BookOpen,
  Shield,
  Code2,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AudienceLevel,
  OnboardingConfig,
  RepoIntelligence,
  RepoModuleProfile,
  VideoIntent,
} from "@/lib/types";

interface Props {
  intelligence: RepoIntelligence;
  onComplete: (config: OnboardingConfig) => void;
  onBack: () => void;
}

type WizardStep = "audience" | "intent" | "scope" | "review";
const STEPS: WizardStep[] = ["audience", "intent", "scope", "review"];

const WORDS_PER_SECOND = 2.3;
const SECONDS_PER_SCENE_OVERHEAD = 4;

const StepIndicator = ({
  steps,
  current,
}: {
  steps: WizardStep[];
  current: WizardStep;
}) => {
  const currentIdx = steps.indexOf(current);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-1.5">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-all ${
              i < currentIdx
                ? "bg-primary/20 text-primary"
                : i === currentIdx
                  ? "bg-primary text-primary-foreground shadow-[0_4px_16px_rgba(104,132,255,0.3)]"
                  : "bg-white/[0.06] text-white/28"
            }`}
          >
            {i < currentIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-6 transition-all ${
                i < currentIdx ? "bg-primary/40" : "bg-white/[0.08]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

const ChoiceCard = ({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group w-full rounded-xl p-4 text-left transition-all ${
      selected
        ? "bg-primary/12 shadow-[inset_0_0_0_1px_rgba(104,132,255,0.4)]"
        : "bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] hover:bg-white/[0.06]"
    }`}
  >
    <div className="flex items-start gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
          selected ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-white/36"
        }`}
      >
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm font-semibold transition ${
            selected ? "text-primary" : "text-white/72"
          }`}
        >
          {title}
        </div>
        <p className="mt-1 text-xs text-white/40 leading-relaxed">{description}</p>
      </div>
      <div
        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border transition ${
          selected
            ? "border-primary bg-primary"
            : "border-white/16 bg-transparent"
        }`}
      >
        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
      </div>
    </div>
  </button>
);

const ModuleToggle = ({
  mod,
  selected,
  onToggle,
}: {
  mod: RepoModuleProfile;
  selected: boolean;
  onToggle: () => void;
}) => {
  const complexityColor = {
    low: "text-emerald-300",
    medium: "text-amber-300",
    high: "text-rose-300",
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group w-full rounded-lg p-3 text-left transition-all ${
        selected
          ? "bg-primary/10 shadow-[inset_0_0_0_1px_rgba(104,132,255,0.3)]"
          : "bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-5 w-5 items-center justify-center rounded border transition ${
            selected
              ? "border-primary bg-primary"
              : "border-white/16 bg-transparent"
          }`}
        >
          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${selected ? "text-white" : "text-white/64"}`}>
              {mod.label}
            </span>
            {mod.is_entry && (
              <span className="rounded-full bg-primary/14 px-1.5 py-0.5 text-[9px] text-primary">
                entry
              </span>
            )}
            {mod.is_hub && (
              <span className="rounded-full bg-amber-300/14 px-1.5 py-0.5 text-[9px] text-amber-300">
                hub
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-white/28">{mod.file_paths.length} files</span>
            <span className={`text-[10px] ${complexityColor[mod.complexity]}`}>
              {mod.complexity}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export const OnboardingWizard = ({ intelligence, onComplete, onBack }: Props) => {
  const [step, setStep] = useState<WizardStep>("audience");
  const [audience, setAudience] = useState<AudienceLevel>("intermediate");
  const [intent, setIntent] = useState<VideoIntent>("onboarding");
  const [intentCustom, setIntentCustom] = useState("");
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(() => {
    return new Set(intelligence.modules.map((m) => m.id));
  });
  const [masterJourney, setMasterJourney] = useState(true);
  const [focusedTutorials, setFocusedTutorials] = useState(false);

  const toggleModule = useCallback((id: string) => {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedModules = useMemo(
    () => intelligence.modules.filter((m) => selectedModuleIds.has(m.id)),
    [intelligence.modules, selectedModuleIds]
  );

  const estimatedMinutes = useMemo(() => {
    const depthMultiplier =
      audience === "beginner" ? 1.4 : audience === "architect" ? 1.2 : 1.0;
    const base = selectedModules.reduce((sum, m) => {
      const fileMin = m.file_paths.length * 0.6;
      const cxFactor = m.complexity === "high" ? 1.5 : m.complexity === "medium" ? 1.2 : 1.0;
      return sum + fileMin * cxFactor;
    }, 0);
    return Math.max(3, Math.round(base * depthMultiplier));
  }, [selectedModules, audience]);

  const estimatedScenes = useMemo(
    () => Math.max(5, Math.round(estimatedMinutes * 2.5)),
    [estimatedMinutes]
  );

  const estimatedWords = useMemo(
    () => Math.round(estimatedMinutes * 60 * WORDS_PER_SECOND),
    [estimatedMinutes]
  );

  const currentIdx = STEPS.indexOf(step);

  const handleNext = () => {
    if (currentIdx < STEPS.length - 1) {
      setStep(STEPS[currentIdx + 1]);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setStep(STEPS[currentIdx - 1]);
    } else {
      onBack();
    }
  };

  const handleComplete = () => {
    onComplete({
      audience,
      intent,
      intent_custom: intent === "custom" ? intentCustom : undefined,
      selected_module_ids: Array.from(selectedModuleIds),
      master_journey_enabled: masterJourney,
      focused_tutorials_enabled: focusedTutorials,
      target_minutes: estimatedMinutes,
      voice_enabled: true,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-primary/80">
              Configure Your Walkthrough
            </div>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {intelligence.repo_name}
            </h2>
          </div>
          <StepIndicator steps={STEPS} current={step} />
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-2xl gf-panel p-6 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        {step === "audience" && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4.5 w-4.5 text-primary/60" />
              <h3 className="text-base font-semibold text-white">Who is this for?</h3>
            </div>
            <p className="text-sm text-white/40 mb-5">
              Depth and vocabulary adapt to the audience level.
            </p>
            <div className="space-y-2.5">
              <ChoiceCard
                icon={BookOpen}
                title="Beginner"
                description="New to the stack. Explain concepts from scratch, use analogies, avoid jargon."
                selected={audience === "beginner"}
                onClick={() => setAudience("beginner")}
              />
              <ChoiceCard
                icon={Code2}
                title="Intermediate"
                description="Familiar with the language and patterns. Focus on the codebase's specific design decisions."
                selected={audience === "intermediate"}
                onClick={() => setAudience("intermediate")}
              />
              <ChoiceCard
                icon={Compass}
                title="Architect"
                description="Senior/staff-level walkthrough. Trade-offs, scaling considerations, boundary decisions."
                selected={audience === "architect"}
                onClick={() => setAudience("architect")}
              />
            </div>
          </div>
        )}

        {step === "intent" && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4.5 w-4.5 text-primary/60" />
              <h3 className="text-base font-semibold text-white">What's the goal?</h3>
            </div>
            <p className="text-sm text-white/40 mb-5">
              The narrative arc adapts to the viewer's purpose.
            </p>
            <div className="space-y-2.5">
              <ChoiceCard
                icon={Users}
                title="Onboard a New Dev"
                description="Get a new team member productive. Cover architecture, key modules, and dev flow."
                selected={intent === "onboarding"}
                onClick={() => setIntent("onboarding")}
              />
              <ChoiceCard
                icon={Shield}
                title="Security Review Story"
                description="Walk through auth, permissions, data flow, and trust boundaries."
                selected={intent === "security_review"}
                onClick={() => setIntent("security_review")}
              />
              <ChoiceCard
                icon={Zap}
                title="Feature Shipping Path"
                description="Show the end-to-end path for shipping a feature: entry → logic → tests → deploy."
                selected={intent === "feature_shipping"}
                onClick={() => setIntent("feature_shipping")}
              />
              <ChoiceCard
                icon={Compass}
                title="Architecture Overview"
                description="Bird's-eye view for stakeholders. Layers, boundaries, data flow."
                selected={intent === "architecture_overview"}
                onClick={() => setIntent("architecture_overview")}
              />
            </div>
          </div>
        )}

        {step === "scope" && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid className="h-4.5 w-4.5 text-primary/60" />
              <h3 className="text-base font-semibold text-white">Select Modules</h3>
            </div>
            <p className="text-sm text-white/40 mb-4">
              Pick which parts of the repo to include. More modules = longer video.
            </p>

            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() =>
                  setSelectedModuleIds(new Set(intelligence.modules.map((m) => m.id)))
                }
                className="text-[11px] text-primary hover:text-primary/80 transition"
              >
                Select all
              </button>
              <span className="text-white/16">|</span>
              <button
                type="button"
                onClick={() => setSelectedModuleIds(new Set())}
                className="text-[11px] text-white/36 hover:text-white/56 transition"
              >
                Clear
              </button>
              <span className="ml-auto text-[11px] text-white/28">
                {selectedModuleIds.size} of {intelligence.modules.length} selected
              </span>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2 max-h-[320px] overflow-y-auto pr-1">
              {intelligence.modules.map((mod) => (
                <ModuleToggle
                  key={mod.id}
                  mod={mod}
                  selected={selectedModuleIds.has(mod.id)}
                  onToggle={() => toggleModule(mod.id)}
                />
              ))}
            </div>

            {/* Output toggles */}
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/34 mb-3">
                Output Format
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-4 py-3 cursor-pointer hover:bg-white/[0.06] transition">
                  <input
                    type="checkbox"
                    checked={masterJourney}
                    onChange={() => setMasterJourney(!masterJourney)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent text-primary focus:ring-primary/40"
                  />
                  <div>
                    <div className="text-sm font-medium text-white/72">Master Journey</div>
                    <div className="text-[11px] text-white/36">
                      Full-repo narrative with chapter ticks (default)
                    </div>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-4 py-3 cursor-pointer hover:bg-white/[0.06] transition">
                  <input
                    type="checkbox"
                    checked={focusedTutorials}
                    onChange={() => setFocusedTutorials(!focusedTutorials)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent text-primary focus:ring-primary/40"
                  />
                  <div>
                    <div className="text-sm font-medium text-white/72">Focused Tutorials</div>
                    <div className="text-[11px] text-white/36">
                      Shorter standalone videos for each selected module
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4.5 w-4.5 text-primary/60" />
              <h3 className="text-base font-semibold text-white">Review & Generate</h3>
            </div>
            <p className="text-sm text-white/40 mb-5">
              Confirm your choices. Generation runs chapter by chapter — you can start watching early.
            </p>

            <div className="grid gap-3 sm:grid-cols-3 mb-5">
              <div className="rounded-xl bg-white/[0.04] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/34">
                  Est. Duration
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">{estimatedMinutes}</span>
                  <span className="text-sm text-white/40">min</span>
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/34">
                  Scenes
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">~{estimatedScenes}</span>
                  <span className="text-sm text-white/40">scenes</span>
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/34">
                  Narration
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">
                    {estimatedWords > 1000
                      ? `${(estimatedWords / 1000).toFixed(1)}k`
                      : estimatedWords}
                  </span>
                  <span className="text-sm text-white/40">words</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <ReviewRow
                label="Audience"
                value={audience === "beginner" ? "Beginner" : audience === "architect" ? "Architect" : "Intermediate"}
              />
              <ReviewRow
                label="Intent"
                value={
                  intent === "onboarding"
                    ? "Onboard a New Dev"
                    : intent === "security_review"
                      ? "Security Review"
                      : intent === "feature_shipping"
                        ? "Feature Shipping"
                        : intent === "architecture_overview"
                          ? "Architecture Overview"
                          : intentCustom || "Custom"
                }
              />
              <ReviewRow label="Modules" value={`${selectedModuleIds.size} of ${intelligence.modules.length}`} />
              <ReviewRow
                label="Outputs"
                value={[
                  masterJourney && "Master journey",
                  focusedTutorials && "Focused tutorials",
                ]
                  .filter(Boolean)
                  .join(" + ") || "None selected"}
              />
            </div>

            {/* Cost / time hint */}
            <div className="mt-5 rounded-xl bg-amber-300/8 p-4 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.12)]">
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-amber-200">
                    Time & Cost Estimate
                  </div>
                  <p className="mt-1 text-xs text-white/40 leading-relaxed">
                    {estimatedMinutes > 20
                      ? `${estimatedMinutes}+ minutes is a long video. LLM and TTS costs scale linearly. Expect 3–8 minutes of generation time with chapter-based incremental output.`
                      : `Should complete in under 2 minutes. Each chapter generates independently so you can start watching early.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handlePrev} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          {currentIdx === 0 ? "Back to Intelligence" : "Previous"}
        </Button>

        {step === "review" ? (
          <Button
            size="sm"
            onClick={handleComplete}
            disabled={selectedModuleIds.size === 0 || (!masterJourney && !focusedTutorials)}
            className="gap-1.5 shadow-[0_8px_24px_rgba(104,132,255,0.2)]"
          >
            <Sparkles className="h-4 w-4" />
            Generate Video
          </Button>
        ) : (
          <Button size="sm" onClick={handleNext} className="gap-1.5">
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

const ReviewRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-4 py-2.5">
    <span className="text-xs text-white/40">{label}</span>
    <span className="text-sm font-medium text-white/72">{value}</span>
  </div>
);
