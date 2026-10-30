import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SynthProjectStatus } from "#/constants/synth-control";
import {
  EMPTY_MODEL,
  type DataFlow,
  type DataModel,
  type Dataset,
  type Distribution,
  type Entity,
  type Field,
  type Row,
  type Rule,
  type Scenario,
  type SemanticKind,
} from "#/lib/synth/model";
import type { ExportFormat, ExportedFile } from "#/lib/synth/exporters";
import type { ValidationReport } from "#/lib/synth/validate";
import type { DocRequirement, DocumentFormat } from "#/lib/synth/documents";

/**
 * Neo Synth studio state.
 *
 * One store keyed by project. The data model the agent (or the parsers)
 * discovered, the scenarios, every generation run with its validation
 * verdict, and the log are persisted so a reload or a restarted
 * agent-server never loses the shape of the data. Generated rows are NOT
 * persisted: a run keeps a small preview, and the full dataset lives in an
 * in-memory cache for the life of the tab (and in the workspace when the
 * studio could write it).
 *
 * Nothing here holds real data: profiles carry labels and statistics, the
 * model carries names and types, runs carry synthetic rows only.
 */

export interface ProjectSource {
  /**
   * `document`: no codebase -- the data model comes from requirement
   * documents (BRD, FRD, data dictionary) the user uploaded.
   */
  kind: "repository" | "folder" | "document";
  /** "owner/name", an absolute path, or the first document's file name. */
  name: string;
  branch?: string;
  gitProvider?: string;
}

/**
 * A requirements document read into the project. Only the scrubbed text
 * goes to the agent's workspace; the store keeps what came out of it.
 */
export interface SynthDocument {
  id: string;
  name: string;
  format: DocumentFormat;
  bytes: number;
  chars: number;
  addedAt: string;
  addedBy: "user" | "agent";
  /** Scrubbed text in the agent's workspace, once written. */
  workspacePath: string | null;
  /** The original file, written only when its text could not be read here. */
  originalPath?: string | null;
  unreadable: boolean;
  personalValuesRemoved: number;
  entities: string[];
  fields: number;
  rules: number;
  warnings: string[];
}

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface ChoiceQuestion {
  id: string;
  title: string;
  prompt?: string;
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

export interface RunVerification {
  loadedInto?: string;
  rowsLoaded?: number;
  testsTotal?: number;
  testsPassing?: number;
  notes?: string;
  at: string;
}

export interface RunValidationSummary {
  ok: boolean;
  checksTotal: number;
  checksPassed: number;
  failed: {
    id: string;
    label: string;
    entity: string;
    failures: number;
    samples: string[];
  }[];
}

export interface SynthRun {
  id: string;
  scenarioId: string;
  scenarioName: string;
  seed: number;
  modelHash: string;
  formats: ExportFormat[];
  startedAt: string;
  finishedAt: string;
  rowsTotal: number;
  rowsPerEntity: Record<string, number>;
  edgeRowsPerEntity: Record<string, number>;
  validation: RunValidationSummary;
  warnings: string[];
  /** Where the run was written in the workspace, when it could be. */
  workspaceDir?: string;
  writtenFiles: string[];
  writeError?: string;
  /** First rows per entity, for the preview table. */
  preview: Record<string, Row[]>;
  verification?: RunVerification;
  triggeredBy: "agent" | "user";
}

export interface SynthReport {
  summary: string;
  artifacts: string[];
  at: string;
}

export interface SynthProject {
  id: string;
  name: string;
  source: ProjectSource;
  conversationId: string | null;
  status: SynthProjectStatus;
  model: DataModel;
  /** Scenarios the agent or the user defined; built-ins are derived. */
  scenarios: Scenario[];
  questions: ChoiceQuestion[];
  runs: SynthRun[];
  log: LogEntry[];
  report: SynthReport | null;
  /** Requirement documents this project was built from (document projects). */
  documents: SynthDocument[];
  /** What those documents asked for, and what each became in the model. */
  requirements: DocRequirement[];
  /**
   * Ids of synth_control actions this studio already dispatched. A command
   * that reaches the agent-server while the tab is reloading (Vite HMR, a
   * closed tab) is otherwise lost; the studio replays unhandled ones from
   * the conversation history on mount.
   */
  handledActionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const MAX_LOG_ENTRIES = 400;
export const MAX_HANDLED_ACTIONS = 300;
export const MAX_RUNS = 30;
export const PREVIEW_ROWS = 8;
export const MAX_REQUIREMENTS = 600;

interface SynthStudioState {
  projects: Record<string, SynthProject>;
  activeProjectId: string | null;
}

interface SynthStudioActions {
  createProject: (input: {
    id?: string;
    name: string;
    source: ProjectSource;
  }) => SynthProject;
  setActiveProject: (id: string | null) => void;
  setConversationId: (projectId: string, conversationId: string | null) => void;
  setStatus: (projectId: string, status: SynthProjectStatus) => void;
  removeProject: (projectId: string) => void;
  /** Merge entities by id; a later mention adds fields, never erases. */
  upsertEntities: (
    projectId: string,
    entities: Entity[],
    options?: { replace?: boolean },
  ) => void;
  /** Replaces entities by id wholesale (no merge), e.g. after linking keys. */
  replaceEntities: (projectId: string, entities: Entity[]) => void;
  removeEntity: (projectId: string, entityId: string) => void;
  setFieldSemantic: (
    projectId: string,
    entityId: string,
    fieldName: string,
    semantic: SemanticKind,
  ) => void;
  /** Edits the user-owned parts of a field (meaning, privacy, context). */
  updateField: (
    projectId: string,
    entityId: string,
    fieldName: string,
    patch: Partial<
      Pick<Field, "semantic" | "pii" | "treatment" | "context" | "examples">
    >,
  ) => void;
  setFieldDistribution: (
    projectId: string,
    entityId: string,
    fieldName: string,
    distribution: Distribution | null,
  ) => void;
  upsertRules: (projectId: string, rules: Rule[]) => void;
  /** Adds (or replaces, by id) a document and its requirements. */
  addDocument: (
    projectId: string,
    document: SynthDocument,
    requirements: DocRequirement[],
  ) => void;
  setDocumentPaths: (
    projectId: string,
    documentId: string,
    paths: { workspacePath: string | null; originalPath?: string | null },
  ) => void;
  removeRule: (projectId: string, ruleId: string) => void;
  upsertFlows: (projectId: string, flows: DataFlow[]) => void;
  askQuestion: (projectId: string, question: ChoiceQuestion) => void;
  answerQuestion: (
    projectId: string,
    questionId: string,
    selected: string[],
    other?: string,
  ) => ChoiceQuestion | null;
  upsertScenarios: (projectId: string, scenarios: Scenario[]) => void;
  removeScenario: (projectId: string, scenarioId: string) => void;
  addRun: (projectId: string, run: SynthRun) => void;
  setRunVerification: (
    projectId: string,
    runId: string,
    verification: RunVerification,
  ) => SynthRun | null;
  appendLog: (projectId: string, entry: LogEntry) => void;
  setReport: (projectId: string, report: SynthReport | null) => void;
  /** Records an action as dispatched; returns false when it already was. */
  markActionHandled: (projectId: string, actionId: string) => boolean;
  reset: () => void;
}

export type SynthStudioStore = SynthStudioState & SynthStudioActions;

const EMPTY_STATE: SynthStudioState = {
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

export function emptySynthProject(input: {
  id?: string;
  name: string;
  source: ProjectSource;
}): SynthProject {
  const at = now();
  return {
    id: input.id ?? newId("sy"),
    name: input.name,
    source: input.source,
    conversationId: null,
    status: "intake",
    model: { ...EMPTY_MODEL, entities: [], rules: [], flows: [] },
    scenarios: [],
    questions: [],
    runs: [],
    log: [],
    report: null,
    documents: [],
    requirements: [],
    handledActionIds: [],
    createdAt: at,
    updatedAt: at,
  };
}

function mergeEntity(existing: Entity, incoming: Entity): Entity {
  const fields = new Map(existing.fields.map((f) => [f.name, f]));
  for (const field of incoming.fields) {
    const prev = fields.get(field.name);
    // An undefined property must never erase an earlier value.
    const patch = Object.fromEntries(
      Object.entries(field).filter(([, v]) => v !== undefined),
    ) as typeof field;
    fields.set(field.name, prev ? { ...prev, ...patch } : field);
  }
  return {
    ...existing,
    ...Object.fromEntries(
      Object.entries(incoming).filter(
        ([k, v]) => v !== undefined && k !== "fields" && k !== "evidence",
      ),
    ),
    fields: [...fields.values()],
    evidence: [...new Set([...existing.evidence, ...incoming.evidence])],
  };
}

export const useSynthStudioStore = create<SynthStudioStore>()(
  persist(
    (set, get) => {
      const patchProject = (
        projectId: string,
        updater: (project: SynthProject) => SynthProject,
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
      const patchModel = (
        projectId: string,
        updater: (model: DataModel) => DataModel,
      ) => patchProject(projectId, (p) => ({ ...p, model: updater(p.model) }));

      return {
        ...EMPTY_STATE,

        createProject: (input) => {
          const project = emptySynthProject(input);
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

        upsertEntities: (projectId, entities, options) =>
          patchModel(projectId, (model) => {
            const byId = new Map(
              options?.replace ? [] : model.entities.map((e) => [e.id, e]),
            );
            for (const entity of entities) {
              const existing = byId.get(entity.id);
              byId.set(
                entity.id,
                existing ? mergeEntity(existing, entity) : entity,
              );
            }
            return { ...model, entities: [...byId.values()] };
          }),

        replaceEntities: (projectId, entities) =>
          patchModel(projectId, (model) => {
            const byId = new Map(entities.map((e) => [e.id, e]));
            return {
              ...model,
              entities: model.entities.map((e) => byId.get(e.id) ?? e),
            };
          }),

        removeEntity: (projectId, entityId) =>
          patchModel(projectId, (model) => ({
            ...model,
            entities: model.entities.filter((e) => e.id !== entityId),
            rules: model.rules.filter((r) => r.entity !== entityId),
          })),

        setFieldSemantic: (projectId, entityId, fieldName, semantic) =>
          patchModel(projectId, (model) => ({
            ...model,
            entities: model.entities.map((e) =>
              e.id !== entityId
                ? e
                : {
                    ...e,
                    fields: e.fields.map((f) =>
                      f.name === fieldName ? { ...f, semantic } : f,
                    ),
                  },
            ),
          })),

        updateField: (projectId, entityId, fieldName, patch) =>
          patchModel(projectId, (model) => ({
            ...model,
            entities: model.entities.map((e) =>
              e.id !== entityId
                ? e
                : {
                    ...e,
                    fields: e.fields.map((f) => {
                      if (f.name !== fieldName) return f;
                      const next: Field = { ...f, ...patch };
                      // Clearing a value removes the key, so describe and
                      // the model hash stay clean.
                      for (const key of Object.keys(patch) as (keyof Field)[]) {
                        const v = next[key];
                        if (
                          v === undefined ||
                          v === "" ||
                          (Array.isArray(v) && v.length === 0)
                        ) {
                          delete next[key];
                        }
                      }
                      return next;
                    }),
                  },
            ),
          })),

        setFieldDistribution: (projectId, entityId, fieldName, distribution) =>
          patchModel(projectId, (model) => ({
            ...model,
            entities: model.entities.map((e) =>
              e.id !== entityId
                ? e
                : {
                    ...e,
                    fields: e.fields.map((f) =>
                      f.name === fieldName
                        ? { ...f, distribution: distribution ?? undefined }
                        : f,
                    ),
                  },
            ),
          })),

        addDocument: (projectId, document, requirements) =>
          patchProject(projectId, (p) => ({
            ...p,
            documents: [
              ...(p.documents ?? []).filter((d) => d.id !== document.id),
              document,
            ],
            requirements: [
              ...(p.requirements ?? []).filter((r) => r.docId !== document.id),
              ...requirements,
            ].slice(0, MAX_REQUIREMENTS),
          })),

        setDocumentPaths: (projectId, documentId, paths) =>
          patchProject(projectId, (p) => ({
            ...p,
            documents: (p.documents ?? []).map((d) =>
              d.id === documentId ? { ...d, ...paths } : d,
            ),
          })),

        upsertRules: (projectId, rules) =>
          patchModel(projectId, (model) => {
            const byId = new Map(model.rules.map((r) => [r.id, r]));
            for (const rule of rules) byId.set(rule.id, rule);
            return { ...model, rules: [...byId.values()] };
          }),

        removeRule: (projectId, ruleId) =>
          patchModel(projectId, (model) => ({
            ...model,
            rules: model.rules.filter((r) => r.id !== ruleId),
          })),

        upsertFlows: (projectId, flows) =>
          patchModel(projectId, (model) => {
            const byId = new Map(model.flows.map((f) => [f.id, f]));
            for (const flow of flows) byId.set(flow.id, flow);
            return { ...model, flows: [...byId.values()] };
          }),

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

        upsertScenarios: (projectId, scenarios) =>
          patchProject(projectId, (p) => {
            const byId = new Map(p.scenarios.map((s) => [s.id, s]));
            for (const scenario of scenarios) byId.set(scenario.id, scenario);
            return { ...p, scenarios: [...byId.values()] };
          }),

        removeScenario: (projectId, scenarioId) =>
          patchProject(projectId, (p) => ({
            ...p,
            scenarios: p.scenarios.filter((s) => s.id !== scenarioId),
          })),

        addRun: (projectId, run) =>
          patchProject(projectId, (p) => ({
            ...p,
            runs: [...p.runs, run].slice(-MAX_RUNS),
          })),

        setRunVerification: (projectId, runId, verification) => {
          const project = get().projects[projectId];
          const run = project?.runs.find((r) => r.id === runId);
          if (!project || !run) return null;
          const updated: SynthRun = { ...run, verification };
          patchProject(projectId, (p) => ({
            ...p,
            runs: p.runs.map((r) => (r.id === runId ? updated : r)),
          }));
          return updated;
        },

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

        reset: () => {
          runCache.clear();
          set({ ...EMPTY_STATE });
        },
      };
    },
    {
      name: "openhands-synth-studio",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v2: document projects (documents + requirements on every project).
      migrate: (persisted, version) => {
        const state = persisted as SynthStudioState;
        if (version < 2 && state?.projects) {
          for (const project of Object.values(state.projects)) {
            project.documents ??= [];
            project.requirements ??= [];
          }
        }
        return state;
      },
    },
  ),
);

/**
 * Full datasets and exported files of this tab's runs. Not persisted (a
 * load run is hundreds of thousands of rows); after a reload the preview
 * and the workspace copy remain.
 */
export interface CachedRun {
  dataset: Dataset;
  files: ExportedFile[];
  validation: ValidationReport;
}
const runCache = new Map<string, CachedRun>();

export function cacheRun(runId: string, cached: CachedRun) {
  runCache.set(runId, cached);
  // Keep memory bounded: oldest runs fall out first.
  while (runCache.size > 6) {
    const first = runCache.keys().next().value;
    if (first === undefined) break;
    runCache.delete(first);
  }
}

export function getCachedRun(runId: string): CachedRun | undefined {
  return runCache.get(runId);
}

export { newId as newSynthId };
