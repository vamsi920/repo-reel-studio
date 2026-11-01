import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TestProjectStatus } from "#/constants/test-control";
import type {
  GateRule,
  Severity,
  SuitePlan,
  TestKind,
  TestReport,
} from "#/lib/testing/model";
import { DEFAULT_GATES } from "#/lib/testing/gates";

/**
 * Neo Test studio state.
 *
 * One store keyed by project: the stack the agent recorded, the plan
 * (suites), the gates, every run's report, the findings and the log. Runs
 * keep the parsed report (bounded per suite) so the trend survives a reload;
 * raw artifacts stay in the workspace under `.neotest/runs/<id>/`.
 *
 * @spec NT-001 — Project and source
 */

export interface ProjectSource {
  kind: "repository" | "folder";
  /** "owner/name" or an absolute path. */
  name: string;
  branch?: string;
  gitProvider?: string;
}

export interface StackInfo {
  languages: string[];
  frameworks: string[];
  runners: string[];
  /** Existing test commands/directories the agent found. */
  existingSuites: {
    kind: TestKind;
    name: string;
    command?: string;
    path?: string;
  }[];
  /** How the app is started for e2e/api/perf, when known. */
  appStart?: { command: string; url: string; readyPath?: string };
  dataSources: string[];
  ci: string[];
  notes?: string;
  evidence: string[];
  recordedAt: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  /** Studio-authored options carry i18n keys; `label` is the English fallback. */
  labelKey?: string;
  descriptionKey?: string;
}

export interface ChoiceQuestion {
  id: string;
  title: string;
  prompt?: string;
  /** Who asked: the agent (default) or the studio (failure triage). */
  askedBy?: "agent" | "studio";
  titleKey?: string;
  promptKey?: string;
  /** Interpolation values for the studio's keys. */
  values?: Record<string, string | number>;
  kind: "single" | "multi";
  options: ChoiceOption[];
  allowOther: boolean;
  status: "open" | "answered";
  selected: string[];
  other?: string;
  at: string;
}

export interface LogEntry {
  id: string;
  level: "info" | "warn" | "error" | "success";
  text: string;
  at: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  kind: TestKind;
  description: string;
  file?: string;
  line?: number;
  suite?: string;
  test?: string;
  evidence: string[];
  status: "open" | "fixed" | "wontfix";
  at: string;
}

export interface TestRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "done" | "failed" | "timeout";
  suiteIds: string[];
  triggeredBy: TestReport["trigger"];
  report?: TestReport;
  error?: string;
  /** Live progress while running: suite id -> harness status. */
  progress: Record<string, string>;
}

export interface TestSummary {
  summary: string;
  artifacts: string[];
  at: string;
}

export interface Schedule {
  automationId: string;
  name: string;
  kind: "cron" | "event";
  description: string;
  createdAt: string;
}

/** What Neo knows about the project's KT docs (see src/lib/testing/kt.ts). */
export interface TestKtState {
  status: "unknown" | "none" | "available" | "generating" | "error";
  /** Where the docs came from when available. */
  from?: "store" | "supabase" | "generated";
  commitSha?: string;
  generatedAt?: string;
  title?: string;
  pages?: {
    id: string;
    title: string;
    path: string;
    importance: "high" | "medium" | "low";
  }[];
  indexPath?: string;
  /** Commit of the docs written into the workspace, when written. */
  exportedCommit: string | null;
  error?: string;
  checkedAt: string;
}

export interface TestProject {
  id: string;
  name: string;
  source: ProjectSource;
  conversationId: string | null;
  status: TestProjectStatus;
  stack: StackInfo | null;
  plan: SuitePlan[];
  gates: GateRule[];
  questions: ChoiceQuestion[];
  runs: TestRun[];
  findings: Finding[];
  log: LogEntry[];
  report: TestSummary | null;
  schedule: Schedule | null;
  kt: TestKtState;
  /** Ids of test_control actions already dispatched (replay protection). */
  handledActionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const MAX_LOG_ENTRIES = 400;
export const MAX_HANDLED_ACTIONS = 300;
export const MAX_RUNS = 40;
export const MAX_FINDINGS = 200;

interface TestStudioState {
  projects: Record<string, TestProject>;
  activeProjectId: string | null;
}

interface TestStudioActions {
  createProject: (input: {
    id?: string;
    name: string;
    source: ProjectSource;
  }) => TestProject;
  setActiveProject: (id: string | null) => void;
  setConversationId: (projectId: string, conversationId: string | null) => void;
  setStatus: (projectId: string, status: TestProjectStatus) => void;
  removeProject: (projectId: string) => void;
  setStack: (projectId: string, stack: StackInfo) => void;
  /** Merge suites by id (replace: drop the ones not mentioned). */
  upsertSuites: (
    projectId: string,
    suites: SuitePlan[],
    options?: { replace?: boolean },
  ) => void;
  removeSuite: (projectId: string, suiteId: string) => void;
  setGates: (projectId: string, gates: GateRule[]) => void;
  askQuestion: (projectId: string, question: ChoiceQuestion) => void;
  answerQuestion: (
    projectId: string,
    questionId: string,
    selected: string[],
    other?: string,
  ) => ChoiceQuestion | null;
  addRun: (projectId: string, run: TestRun) => void;
  updateRun: (
    projectId: string,
    runId: string,
    patch: Partial<TestRun>,
  ) => TestRun | null;
  upsertFindings: (projectId: string, findings: Finding[]) => void;
  setFindingStatus: (
    projectId: string,
    findingId: string,
    status: Finding["status"],
  ) => void;
  appendLog: (projectId: string, entry: LogEntry) => void;
  setReport: (projectId: string, report: TestSummary | null) => void;
  setSchedule: (projectId: string, schedule: Schedule | null) => void;
  setKt: (projectId: string, kt: Partial<TestKtState>) => void;
  markActionHandled: (projectId: string, actionId: string) => boolean;
  reset: () => void;
}

export type TestStudioStore = TestStudioState & TestStudioActions;

const EMPTY_STATE: TestStudioState = { projects: {}, activeProjectId: null };

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

export function emptyTestProject(input: {
  id?: string;
  name: string;
  source: ProjectSource;
}): TestProject {
  const at = now();
  return {
    id: input.id ?? newId("nt"),
    name: input.name,
    source: input.source,
    conversationId: null,
    status: "intake",
    stack: null,
    plan: [],
    gates: DEFAULT_GATES.map((g) => ({ ...g })),
    questions: [],
    runs: [],
    findings: [],
    log: [],
    report: null,
    schedule: null,
    kt: { status: "unknown", exportedCommit: null, checkedAt: at },
    handledActionIds: [],
    createdAt: at,
    updatedAt: at,
  };
}

/** The latest finished run with a report, if any. */
export function latestReport(
  project: Pick<TestProject, "runs">,
): TestReport | undefined {
  for (let i = project.runs.length - 1; i >= 0; i -= 1) {
    const report = project.runs[i].report;
    if (report) return report;
  }
  return undefined;
}

export const useTestStudioStore = create<TestStudioStore>()(
  persist(
    (set, get) => {
      const patchProject = (
        projectId: string,
        updater: (project: TestProject) => TestProject,
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
          const project = emptyTestProject(input);
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

        setStack: (projectId, stack) =>
          patchProject(projectId, (p) => ({ ...p, stack })),

        upsertSuites: (projectId, suites, options) =>
          patchProject(projectId, (p) => {
            const byId = new Map(
              options?.replace ? [] : p.plan.map((s) => [s.id, s]),
            );
            for (const suite of suites) {
              const existing = byId.get(suite.id);
              byId.set(suite.id, existing ? { ...existing, ...suite } : suite);
            }
            return { ...p, plan: [...byId.values()] };
          }),

        removeSuite: (projectId, suiteId) =>
          patchProject(projectId, (p) => ({
            ...p,
            plan: p.plan.filter((s) => s.id !== suiteId),
          })),

        setGates: (projectId, gates) =>
          patchProject(projectId, (p) => ({ ...p, gates })),

        askQuestion: (projectId, question) =>
          patchProject(projectId, (p) => ({
            ...p,
            questions: [
              ...p.questions.filter((q) => q.id !== question.id),
              question,
            ],
          })),

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

        addRun: (projectId, run) =>
          patchProject(projectId, (p) => ({
            ...p,
            runs: [...p.runs, run].slice(-MAX_RUNS),
          })),

        updateRun: (projectId, runId, patch) => {
          const project = get().projects[projectId];
          const run = project?.runs.find((r) => r.id === runId);
          if (!project || !run) return null;
          const updated: TestRun = { ...run, ...patch };
          patchProject(projectId, (p) => ({
            ...p,
            runs: p.runs.map((r) => (r.id === runId ? updated : r)),
          }));
          return updated;
        },

        upsertFindings: (projectId, findings) =>
          patchProject(projectId, (p) => {
            const byId = new Map(p.findings.map((f) => [f.id, f]));
            for (const f of findings)
              byId.set(f.id, { ...byId.get(f.id), ...f });
            return { ...p, findings: [...byId.values()].slice(-MAX_FINDINGS) };
          }),

        setFindingStatus: (projectId, findingId, status) =>
          patchProject(projectId, (p) => ({
            ...p,
            findings: p.findings.map((f) =>
              f.id === findingId ? { ...f, status } : f,
            ),
          })),

        appendLog: (projectId, entry) =>
          patchProject(projectId, (p) => ({
            ...p,
            log: [...p.log, entry].slice(-MAX_LOG_ENTRIES),
          })),

        setReport: (projectId, report) =>
          patchProject(projectId, (p) => ({
            ...p,
            report,
            status: report ? "done" : p.status,
          })),

        setKt: (projectId, kt) =>
          patchProject(projectId, (p) => ({
            ...p,
            kt: { ...p.kt, ...kt, checkedAt: now() },
          })),

        setSchedule: (projectId, schedule) =>
          patchProject(projectId, (p) => ({ ...p, schedule })),

        markActionHandled: (projectId, actionId) => {
          const project = get().projects[projectId];
          if (!project) return false;
          const handled = project.handledActionIds ?? [];
          if (handled.includes(actionId)) return false;
          patchProject(projectId, (p) => ({
            ...p,
            handledActionIds: [...(p.handledActionIds ?? []), actionId].slice(
              -MAX_HANDLED_ACTIONS,
            ),
          }));
          return true;
        },

        reset: () => set({ ...EMPTY_STATE }),
      };
    },
    {
      name: "openhands-test-studio",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v2: `kt` on every project.
      migrate: (persisted, version) => {
        const state = persisted as TestStudioState;
        if (version < 2 && state?.projects) {
          for (const project of Object.values(state.projects)) {
            project.kt ??= {
              status: "unknown",
              exportedCommit: null,
              checkedAt: project.updatedAt,
            };
          }
        }
        return state;
      },
    },
  ),
);

export { newId as newTestId };
