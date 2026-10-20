import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  ComponentKind,
  MigrationPhase,
  ProjectStatus,
  StepStatus,
} from "#/constants/modernization-control";

/**
 * Neo ME (modernization engine) studio state.
 *
 * One store, keyed by project. Everything the agent produces for a project
 * (the stack it discovered, the questions it asked, the plan, live progress,
 * checkpoints, the final report) lives here and is persisted, so closing the
 * tab, a crash, or a restarted agent-server never loses where a migration
 * stood: `describe` hands this state back to the agent on resume.
 *
 * Nothing in here can hold a credential: components carry names and paths,
 * answers carry option ids, checkpoints carry agent-authored state that the
 * brief forbids from containing secrets.
 */

export interface ProjectSource {
  kind: "repository" | "folder";
  /** "owner/name" for a repository, absolute path for a folder. */
  name: string;
  branch?: string;
  gitProvider?: string;
}

export interface StackComponent {
  /** Stable id so the agent can correct a component instead of duplicating it. */
  id: string;
  name: string;
  kind: ComponentKind;
  language?: string;
  framework?: string;
  version?: string;
  /** Logo id from TECH_LOGOS, or free text resolved through aliases. */
  logo?: string;
  /** Paths, REA evidence ids, KT pages. */
  evidence: string[];
  summary?: string;
  /** Chosen migration target for this component, once the user decided. */
  target?: {
    language?: string;
    framework?: string;
    logo?: string;
    note?: string;
  };
  at: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  logo?: string;
  recommended?: boolean;
}

export interface ChoiceQuestion {
  id: string;
  title: string;
  prompt?: string;
  kind: "single" | "multi";
  options: ChoiceOption[];
  allowOther: boolean;
  /** Component the question is about, when it is per-component. */
  componentId?: string;
  status: "open" | "answered";
  selected: string[];
  other?: string;
  at: string;
}

export interface PlanStep {
  id: string;
  phase: MigrationPhase;
  title: string;
  status: StepStatus;
  note?: string;
  /** Optional per-step work estimate, used for the progress ring. */
  weight?: number;
}

export interface ApprovalRequest {
  id: string;
  what: string;
  why?: string;
  status: "pending" | "approved" | "changes";
  comment?: string;
  at: string;
}

export interface ProgressStats {
  filesTotal?: number;
  filesDone?: number;
  testsTotal?: number;
  testsPassing?: number;
  endpointsTotal?: number;
  endpointsDone?: number;
  /** Free-form extra counters the agent reports, e.g. "screens": "4/9". */
  extra?: Record<string, string>;
}

export interface LogEntry {
  id: string;
  level: "info" | "warn" | "error" | "success";
  text: string;
  stepId?: string;
  at: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  stepId?: string;
  state: Record<string, unknown>;
  at: string;
}

export interface MigrationReport {
  summary: string;
  verification?: Record<string, unknown>;
  artifacts: string[];
  at: string;
}

export interface ModernizationProject {
  id: string;
  name: string;
  source: ProjectSource;
  conversationId: string | null;
  status: ProjectStatus;
  components: StackComponent[];
  questions: ChoiceQuestion[];
  plan: PlanStep[];
  currentStepId: string | null;
  approvals: ApprovalRequest[];
  stats: ProgressStats;
  log: LogEntry[];
  checkpoints: Checkpoint[];
  report: MigrationReport | null;
  createdAt: string;
  updatedAt: string;
}

/** Keep the live log bounded; older lines are still in the conversation. */
export const MAX_LOG_ENTRIES = 400;
export const MAX_CHECKPOINTS = 50;

interface ModernizationStudioState {
  projects: Record<string, ModernizationProject>;
  /** Project the studio route is currently showing. */
  activeProjectId: string | null;
}

interface ModernizationStudioActions {
  createProject: (input: {
    id?: string;
    name: string;
    source: ProjectSource;
  }) => ModernizationProject;
  setActiveProject: (id: string | null) => void;
  setConversationId: (projectId: string, conversationId: string | null) => void;
  setStatus: (projectId: string, status: ProjectStatus) => void;
  renameProject: (projectId: string, name: string) => void;
  removeProject: (projectId: string) => void;
  upsertComponents: (projectId: string, components: StackComponent[]) => void;
  askQuestion: (projectId: string, question: ChoiceQuestion) => void;
  answerQuestion: (
    projectId: string,
    questionId: string,
    selected: string[],
    other?: string,
  ) => ChoiceQuestion | null;
  setPlan: (
    projectId: string,
    steps: PlanStep[],
    currentStepId: string | null,
  ) => void;
  updateStep: (
    projectId: string,
    stepId: string,
    patch: Partial<Pick<PlanStep, "status" | "note" | "title">>,
  ) => void;
  setCurrentStep: (projectId: string, stepId: string | null) => void;
  requestApproval: (projectId: string, request: ApprovalRequest) => void;
  resolveApproval: (
    projectId: string,
    approvalId: string,
    status: "approved" | "changes",
    comment?: string,
  ) => ApprovalRequest | null;
  mergeStats: (projectId: string, stats: ProgressStats) => void;
  appendLog: (projectId: string, entry: LogEntry) => void;
  addCheckpoint: (projectId: string, checkpoint: Checkpoint) => void;
  setReport: (projectId: string, report: MigrationReport | null) => void;
  reset: () => void;
}

export type ModernizationStudioStore = ModernizationStudioState &
  ModernizationStudioActions;

const EMPTY_STATE: ModernizationStudioState = {
  projects: {},
  activeProjectId: null,
};

function now() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

/** Per-step progress: done steps over all non-skipped steps, by weight. */
export function planProgress(plan: PlanStep[]): {
  done: number;
  total: number;
  ratio: number;
} {
  const counted = plan.filter((s) => s.status !== "skipped");
  const weightOf = (s: PlanStep) => (s.weight && s.weight > 0 ? s.weight : 1);
  const total = counted.reduce((acc, s) => acc + weightOf(s), 0);
  const done = counted
    .filter((s) => s.status === "done")
    .reduce((acc, s) => acc + weightOf(s), 0);
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

export function emptyProject(input: {
  id?: string;
  name: string;
  source: ProjectSource;
}): ModernizationProject {
  const at = now();
  return {
    id: input.id ?? newId("me"),
    name: input.name,
    source: input.source,
    conversationId: null,
    status: "intake",
    components: [],
    questions: [],
    plan: [],
    currentStepId: null,
    approvals: [],
    stats: {},
    log: [],
    checkpoints: [],
    report: null,
    createdAt: at,
    updatedAt: at,
  };
}

export const useModernizationStudioStore = create<ModernizationStudioStore>()(
  persist(
    (set, get) => {
      const patchProject = (
        projectId: string,
        updater: (project: ModernizationProject) => ModernizationProject,
      ) => {
        const project = get().projects[projectId];
        if (!project) return;
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: { ...updater(project), updatedAt: now() },
          },
        }));
      };

      return {
        ...EMPTY_STATE,

        createProject: (input) => {
          const project = emptyProject(input);
          set((state) => ({
            projects: { ...state.projects, [project.id]: project },
            activeProjectId: project.id,
          }));
          return project;
        },

        setActiveProject: (id) => set({ activeProjectId: id }),

        setConversationId: (projectId, conversationId) =>
          patchProject(projectId, (p) => ({ ...p, conversationId })),

        setStatus: (projectId, status) =>
          patchProject(projectId, (p) => ({ ...p, status })),

        renameProject: (projectId, name) =>
          patchProject(projectId, (p) => ({ ...p, name })),

        removeProject: (projectId) =>
          set((state) => {
            const projects = { ...state.projects };
            delete projects[projectId];
            return {
              projects,
              activeProjectId:
                state.activeProjectId === projectId
                  ? null
                  : state.activeProjectId,
            };
          }),

        upsertComponents: (projectId, components) =>
          patchProject(projectId, (p) => {
            const byId = new Map(p.components.map((c) => [c.id, c]));
            for (const c of components) {
              const existing = byId.get(c.id);
              // A later mention of the same component only adds what it
              // knows: an undefined field must never erase an earlier value.
              const patch = Object.fromEntries(
                Object.entries(c).filter(([, v]) => v !== undefined),
              ) as StackComponent;
              byId.set(c.id, existing ? { ...existing, ...patch } : c);
            }
            return { ...p, components: [...byId.values()] };
          }),

        askQuestion: (projectId, question) =>
          patchProject(projectId, (p) => {
            // Re-asking the same question id replaces it (the agent may
            // refine options) instead of stacking duplicates.
            const rest = p.questions.filter((q) => q.id !== question.id);
            return { ...p, questions: [...rest, question] };
          }),

        answerQuestion: (projectId, questionId, selected, other) => {
          const project = get().projects[projectId];
          const question = project?.questions.find((q) => q.id === questionId);
          if (!project || !question) return null;
          const answered: ChoiceQuestion = {
            ...question,
            status: "answered",
            selected,
            other,
          };
          patchProject(projectId, (p) => ({
            ...p,
            questions: p.questions.map((q) =>
              q.id === questionId ? answered : q,
            ),
          }));
          return answered;
        },

        setPlan: (projectId, steps, currentStepId) =>
          patchProject(projectId, (p) => ({
            ...p,
            plan: steps,
            currentStepId,
            status:
              p.status === "intake" ||
              p.status === "discovering" ||
              p.status === "interviewing"
                ? "planned"
                : p.status,
          })),

        updateStep: (projectId, stepId, patch) =>
          patchProject(projectId, (p) => ({
            ...p,
            plan: p.plan.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
          })),

        setCurrentStep: (projectId, stepId) =>
          patchProject(projectId, (p) => ({ ...p, currentStepId: stepId })),

        requestApproval: (projectId, request) =>
          patchProject(projectId, (p) => ({
            ...p,
            approvals: [
              ...p.approvals.filter((a) => a.id !== request.id),
              request,
            ],
          })),

        resolveApproval: (projectId, approvalId, status, comment) => {
          const project = get().projects[projectId];
          const approval = project?.approvals.find((a) => a.id === approvalId);
          if (!project || !approval) return null;
          const resolved: ApprovalRequest = { ...approval, status, comment };
          patchProject(projectId, (p) => ({
            ...p,
            approvals: p.approvals.map((a) =>
              a.id === approvalId ? resolved : a,
            ),
          }));
          return resolved;
        },

        mergeStats: (projectId, stats) =>
          patchProject(projectId, (p) => ({
            ...p,
            stats: {
              ...p.stats,
              ...stats,
              extra: { ...(p.stats.extra ?? {}), ...(stats.extra ?? {}) },
            },
          })),

        appendLog: (projectId, entry) =>
          patchProject(projectId, (p) => ({
            ...p,
            log: [...p.log, entry].slice(-MAX_LOG_ENTRIES),
          })),

        addCheckpoint: (projectId, checkpoint) =>
          patchProject(projectId, (p) => ({
            ...p,
            checkpoints: [...p.checkpoints, checkpoint].slice(-MAX_CHECKPOINTS),
          })),

        setReport: (projectId, report) =>
          patchProject(projectId, (p) => ({
            ...p,
            report,
            status: report ? "done" : p.status,
          })),

        reset: () => set({ ...EMPTY_STATE }),
      };
    },
    {
      name: "openhands-modernization-studio",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export { newId as newModernizationId };
