// Requirements Engine — ported from document-query-flow (vamsi920/requirements-engine)
// and wired into NeoDevEx's project journey. A guided AI interview builds a
// structured requirement state, then generates a BRD/FRD/Application Summary;
// on completion this hands off into a real NeoDevEx project (blueprint stage),
// pinning condensed requirements into project memory and triggering an SME
// fact-check of the generated documents.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, RotateCcw } from "lucide-react";

import "@/styles/requirementsOnboarding.css";

import StartScreen, { StartPayload } from "@/components/requirements-onboarding/StartScreen";
import ProgressRail from "@/components/requirements-onboarding/ProgressRail";
import UnderstandingPanel from "@/components/requirements-onboarding/UnderstandingPanel";
import OnboardingChat, {
  ChatBubble,
} from "@/components/requirements-onboarding/OnboardingChat";
import GenerateScreen from "@/components/requirements-onboarding/GenerateScreen";

import {
  extractDocuments,
  generateDocuments,
  onboardingStep,
} from "@/lib/requirementsOnboarding/api";
import {
  DocumentPage,
  EMPTY_REQUIREMENT_STATE,
  GeneratedDocs,
  OnboardingMessage,
  RequirementState,
} from "@/lib/requirementsOnboarding/types";

import { useAuth } from "@/context/AuthContext";
import { projectsService } from "@/lib/db";
import { buildScratchProjectSource } from "@/lib/projectSource";
import { recordProjectMemory } from "@/lib/projectMemory";
import { runSmeReview } from "@/lib/smeAgent";
import {
  clearSessionKey,
  deleteOnboardingSession,
  getOrCreateSessionKey,
  loadOnboardingSession,
  saveOnboardingSession,
} from "@/lib/requirementsOnboarding/session";

type Phase = "start" | "interview" | "generate";

let bubbleId = 1;
const nextId = () => bubbleId++;

/**
 * The single next question is already woven into assistantMessage, so the
 * visible message doubles as the history entry the model sees next turn.
 */
const assistantHistory = (message: string, _questions: string[]): string =>
  message;

/** Pin the highest-signal parts of a finished requirement state into
 * per-project memory so every downstream AI step (manifest generation,
 * Repo Q&A, SME review) inherits the "why" behind the project. */
function commitRequirementStateToMemory(
  projectId: string,
  state: RequirementState
) {
  if (state.businessGoal) {
    recordProjectMemory(projectId, {
      kind: "requirement",
      source: "requirements-engine",
      content: `Business goal: ${state.businessGoal}`,
      pinned: true,
      dedupeKey: "requirements:goal",
    });
  }
  recordProjectMemory(projectId, {
    kind: "requirement",
    source: "requirements-engine",
    content: `Project type: ${state.projectType}.`,
    pinned: true,
    dedupeKey: "requirements:type",
  });
  state.features.slice(0, 12).forEach((feature, index) => {
    recordProjectMemory(projectId, {
      kind: "requirement",
      source: "requirements-engine",
      content: `Feature: ${feature}`,
      dedupeKey: `requirements:feature:${index}`,
    });
  });
  state.coreWorkflows.slice(0, 8).forEach((workflow, index) => {
    recordProjectMemory(projectId, {
      kind: "requirement",
      source: "requirements-engine",
      content: `Core workflow: ${workflow}`,
      dedupeKey: `requirements:workflow:${index}`,
    });
  });
  state.userRoles.slice(0, 8).forEach((role, index) => {
    recordProjectMemory(projectId, {
      kind: "requirement",
      source: "requirements-engine",
      content: `User role: ${role}`,
      dedupeKey: `requirements:role:${index}`,
    });
  });
  [...state.risks, ...state.assumptions].slice(0, 10).forEach((item, index) => {
    recordProjectMemory(projectId, {
      kind: "fact",
      source: "requirements-engine",
      content: item,
      dedupeKey: `requirements:risk-or-assumption:${index}`,
    });
  });
  recordProjectMemory(projectId, {
    kind: "event",
    source: "requirements-engine",
    content: `Project onboarded through the Requirements Engine interview (${state.completenessScore}% complete). BRD, FRD, and Application Summary generated.`,
    dedupeKey: "requirements:origin",
  });
}

const RequirementsOnboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("start");
  const [isStarting, setIsStarting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [documents, setDocuments] = useState<DocumentPage[]>([]);
  const [state, setState] = useState<RequirementState>(EMPTY_REQUIREMENT_STATE);
  const [messages, setMessages] = useState<OnboardingMessage[]>([]);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const [docs, setDocs] = useState<GeneratedDocs | null>(null);

  const sessionKeyRef = useRef<string>(getOrCreateSessionKey());

  // Resume an in-progress interview after a refresh (best-effort — silently
  // no-ops if there's nothing to resume or Supabase is unreachable).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snapshot = await loadOnboardingSession(sessionKeyRef.current);
      if (cancelled || !snapshot || snapshot.messages.length === 0) return;
      setState(snapshot.state);
      setMessages(snapshot.messages);
      setDocuments(snapshot.documents);
      setBubbles(
        snapshot.messages.map((m) => ({ id: nextId(), role: m.role, content: m.content }))
      );
      setPhase("interview");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the interview on every turn so a refresh can resume it.
  useEffect(() => {
    if (phase !== "interview" || messages.length === 0) return;
    saveOnboardingSession(sessionKeyRef.current, { state, messages, documents });
  }, [phase, state, messages, documents]);

  const resetAll = () => {
    deleteOnboardingSession(sessionKeyRef.current);
    clearSessionKey();
    sessionKeyRef.current = getOrCreateSessionKey();
    setPhase("start");
    setDocuments([]);
    setState(EMPTY_REQUIREMENT_STATE);
    setMessages([]);
    setBubbles([]);
    setQuestions([]);
    setReasoning("");
    setReadyToGenerate(false);
    setDocs(null);
  };

  const applyStep = (
    res: Awaited<ReturnType<typeof onboardingStep>>,
    priorMessages: OnboardingMessage[]
  ) => {
    setState(res.state);
    setReasoning(res.classificationReasoning);
    setQuestions(res.questions);
    setReadyToGenerate(res.readyToGenerate);
    setBubbles((prev) => [
      ...prev,
      { id: nextId(), role: "assistant", content: res.assistantMessage },
    ]);
    setMessages([
      ...priorMessages,
      {
        role: "assistant",
        content: assistantHistory(res.assistantMessage, res.questions),
      },
    ]);
  };

  const handleStart = async ({ idea, files }: StartPayload) => {
    setIsStarting(true);
    try {
      let extracted: DocumentPage[] = [];
      if (files.length > 0) {
        toast.info("Reading your documents…");
        extracted = await extractDocuments(
          files,
          files.map(() => "uploaded")
        );
        setDocuments(extracted);
      }

      const seedUser =
        idea ||
        (files.length
          ? `I've uploaded ${files.length} document(s) for you to analyse.`
          : "");
      const seedMessages: OnboardingMessage[] = seedUser
        ? [{ role: "user", content: seedUser }]
        : [];

      const res = await onboardingStep({
        messages: seedMessages,
        state: null,
        documents: extracted,
        idea,
      });

      const initialBubbles: ChatBubble[] = [];
      if (idea) {
        initialBubbles.push({ id: nextId(), role: "user", content: idea });
      }
      setBubbles(initialBubbles);
      setPhase("interview");
      applyStep(res, seedMessages);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to start onboarding."
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleSend = async (text: string) => {
    const userMessages: OnboardingMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(userMessages);
    setBubbles((prev) => [...prev, { id: nextId(), role: "user", content: text }]);
    setQuestions([]);
    setIsThinking(true);
    try {
      const res = await onboardingStep({
        messages: userMessages,
        state,
        documents,
      });
      applyStep(res, userMessages);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setIsThinking(false);
    }
  };

  const runGeneration = async () => {
    setIsGenerating(true);
    try {
      const result = await generateDocuments({ state, documents });
      setDocs(result);
      setPhase("generate");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to generate documents."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateProject = async () => {
    if (!docs || !user?.uid) return;
    setIsCreatingProject(true);
    try {
      const source = buildScratchProjectSource(state.projectName);
      const project = await projectsService.create({
        user_id: user.uid,
        repo_url: source.repoUrl,
        repo_name: source.repoName,
        title: `${source.repoName} - Requirements`,
        status: "ready",
        manifest: null,
        duration_seconds: null,
        requirements_docs: {
          brd: docs.brd,
          frd: docs.frd,
          summary: docs.summary,
          projectType: state.projectType,
          generated_at: new Date().toISOString(),
        },
      });

      commitRequirementStateToMemory(project.id, state);

      // Fact-check the generated requirements against any SME material
      // already on file for this project (normally none yet — reports
      // "no_material" quietly, same as every other pipeline step).
      void runSmeReview({
        projectId: project.id,
        step: "requirements",
        label: "BRD / FRD requirements",
        content: `${docs.summary}\n\n${docs.brd}`,
      });

      deleteOnboardingSession(sessionKeyRef.current);
      clearSessionKey();

      toast.success("Project created from your requirements.", {
        description: "BRD, FRD, and Application Summary are saved to the project.",
      });
      navigate(`/dashboard?project=${project.id}`);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not create the project."
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  if (phase === "start") {
    return <StartScreen onStart={handleStart} isStarting={isStarting} />;
  }

  if (phase === "generate" && docs) {
    return (
      <GenerateScreen
        docs={docs}
        state={state}
        regenerating={isGenerating}
        onBack={() => setPhase("interview")}
        onRegenerate={runGeneration}
        onCreateProject={handleCreateProject}
        creatingProject={isCreatingProject}
      />
    );
  }

  // Interview phase
  return (
    <div className="onb-root flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/15">
            <Sparkles className="h-4 w-4 text-cyan-300" />
          </span>
          <span className="text-sm font-semibold text-white">
            Requirements Engine
          </span>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-400/40 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start over
        </button>
      </header>

      {/* Three-column workspace */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-[var(--line)] lg:block">
          <ProgressRail state={state} generating={isGenerating} done={false} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <OnboardingChat
            bubbles={bubbles}
            questions={questions}
            isThinking={isThinking}
            readyToGenerate={readyToGenerate}
            allowManualGenerate={state.completenessScore >= 50}
            onSend={handleSend}
            onGenerate={runGeneration}
          />
        </main>

        <aside className="hidden w-96 shrink-0 border-l border-[var(--line)] xl:block">
          <UnderstandingPanel state={state} classificationReasoning={reasoning} />
        </aside>
      </div>

      {/* Generation overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <div className="onb-panel onb-ticks max-w-sm p-8 text-center">
              <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-cyan-300" />
              <h3 className="text-lg font-semibold text-white">
                Generating your documents
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Writing the BRD, FRD, and Application Summary from your
                requirement state. This takes a few moments…
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RequirementsOnboarding;
