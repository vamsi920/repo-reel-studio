import type { ModernizationControlAction } from "#/types/agent-server/core";
import {
  COMPONENT_KINDS,
  MIGRATION_PHASES,
  MODERNIZATION_CONTROL_COMMANDS,
  MODERNIZATION_RESULT_PREFIX,
  STEP_STATUSES,
  type ComponentKind,
  type MigrationPhase,
  type ModernizationControlCommand,
  type StepStatus,
} from "#/constants/modernization-control";
import {
  newModernizationId,
  planProgress,
  useModernizationStudioStore,
  type ChoiceOption,
  type ChoiceQuestion,
  type ModernizationProject,
  type PlanStep,
  type ProgressStats,
  type StackComponent,
} from "#/stores/modernization-studio-store";
import { scanForSecrets } from "#/lib/environment/discovery-guard";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { resolveTechLogoId } from "#/components/features/modernization/tech-logos";

/**
 * Dispatcher for the `modernization_control` client tool (Neo ME).
 *
 * Mirrors `onboarding-control.ts`: every command mutates the studio store
 * (which the workbench renders) and posts a receipt back into the
 * conversation, because the agent-server acknowledges client tools before
 * the browser does any work. A receipt that rejects a command always says
 * what would have been valid, so the agent can recover without guessing.
 */

export type PostResultFn = (message: string) => void;

export interface DispatchContext {
  postResult: PostResultFn;
  conversationId?: string;
}

export const RECEIPT_NEXT_STEP =
  "Act on this now: call the next modernization_control command, or write to the user. Do not reply empty.";

export function withNextStep(message: string): string {
  if (!message.startsWith(MODERNIZATION_RESULT_PREFIX)) return message;
  try {
    const payload = JSON.parse(
      message.slice(MODERNIZATION_RESULT_PREFIX.length),
    );
    if (!payload || typeof payload !== "object" || "next" in payload) {
      return message;
    }
    return `${MODERNIZATION_RESULT_PREFIX}${JSON.stringify({ ...payload, next: RECEIPT_NEXT_STEP })}`;
  } catch {
    return message;
  }
}

export function createModernizationResultPoster(
  conversationId: string,
): PostResultFn {
  return (message: string) => {
    void AgentServerConversationService.sendMessage(conversationId, {
      role: "user",
      content: [{ type: "text", text: withNextStep(message) }],
    }).catch(() => {
      // The workbench already shows the outcome; a lost receipt must not
      // break the dispatch.
    });
  };
}

export function receipt(payload: Record<string, unknown>): string {
  return `${MODERNIZATION_RESULT_PREFIX}${JSON.stringify(payload)}`;
}

function postReceipt(
  context: DispatchContext,
  payload: Record<string, unknown>,
) {
  context.postResult(receipt(payload));
}

function isCommand(value: string): value is ModernizationControlCommand {
  return (MODERNIZATION_CONTROL_COMMANDS as readonly string[]).includes(value);
}

function payloadOf(
  action: ModernizationControlAction,
): Record<string, unknown> {
  const payload = action.payload;
  return payload && typeof payload === "object" ? payload : {};
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function kindOf(value: unknown): ComponentKind {
  const v = str(value)?.toLowerCase();
  return v && (COMPONENT_KINDS as readonly string[]).includes(v)
    ? (v as ComponentKind)
    : "other";
}

function phaseOf(value: unknown): MigrationPhase | null {
  const v = str(value)?.toLowerCase();
  return v && (MIGRATION_PHASES as readonly string[]).includes(v)
    ? (v as MigrationPhase)
    : null;
}

function statusOf(value: unknown): StepStatus | null {
  const v = str(value)?.toLowerCase().replace("in_progress", "active");
  return v && (STEP_STATUSES as readonly string[]).includes(v)
    ? (v as StepStatus)
    : null;
}

/** The project a conversation belongs to (the studio sets conversationId at start). */
export function findProjectForConversation(
  conversationId: string | undefined,
): ModernizationProject | null {
  if (!conversationId) return null;
  const { projects, activeProjectId } = useModernizationStudioStore.getState();
  const byConversation = Object.values(projects).find(
    (p) => p.conversationId === conversationId,
  );
  if (byConversation) return byConversation;
  // A project created a moment ago whose conversation id was not persisted
  // yet (first tool call racing the store write): fall back to the active one.
  return activeProjectId ? (projects[activeProjectId] ?? null) : null;
}

/** Payload shapes, handed to the agent by `describe`. */
export const COMMAND_SHAPES = Object.freeze({
  describe: "{}",
  record_discovery:
    "{components:[{id?, name, kind: frontend|backend|api|database|mobile|desktop|jobs|messaging|infra|tests|build|auth|other, language?, framework?, version?, logo?, summary?, evidence:[string], target?:{language?, framework?, logo?, note?}}]}",
  ask_choice:
    "{question_id, title, prompt?, kind: single|multi, options:[{id, label, description?, logo?, recommended?}], allow_other?: boolean, component_id?} -> wait for {status:'answered', question_id, selected, other?}",
  set_plan:
    "{steps:[{id, phase: understand|interview|specify|characterize|scaffold|migrate|data|verify|report, title, status?, weight?, note?}], current_step_id?}",
  request_approval:
    "{approval_id?, what, why?} -> wait for {status:'approved'|'changes', approval_id, comment?}",
  update_progress:
    "{step_id?, status?: pending|active|done|skipped|failed, note?, stats?:{files_total?, files_done?, tests_total?, tests_passing?, endpoints_total?, endpoints_done?, extra?:{[label]: string}}}",
  log: "{text, level?: info|warn|error|success, step_id?}",
  checkpoint:
    "{label, step_id?, state:{...anything you need to resume, no secrets}}",
  complete: "{summary, verification?:{...}, artifacts?:[paths]}",
});

function describeProject(project: ModernizationProject) {
  const progress = planProgress(project.plan);
  const openQuestions = project.questions.filter((q) => q.status === "open");
  const last = project.checkpoints[project.checkpoints.length - 1] ?? null;
  return {
    project: {
      id: project.id,
      name: project.name,
      source: project.source,
      status: project.status,
    },
    resumed: project.checkpoints.length > 0 || project.plan.length > 0,
    components: project.components.map(({ at: _at, ...c }) => c),
    answers: project.questions
      .filter((q) => q.status === "answered")
      .map((q) => ({
        question_id: q.id,
        title: q.title,
        selected: q.selected,
        other: q.other,
        component_id: q.componentId,
      })),
    open_questions: openQuestions.map((q) => q.id),
    pending_approvals: project.approvals
      .filter((a) => a.status === "pending")
      .map((a) => a.id),
    plan: project.plan,
    current_step_id: project.currentStepId,
    progress: {
      steps_done: progress.done,
      steps_total: progress.total,
      ...project.stats,
    },
    last_checkpoint: last,
    report: project.report,
    commands: COMMAND_SHAPES,
  };
}

function parseComponents(raw: unknown): {
  components: StackComponent[];
  skipped: unknown[];
} {
  const components: StackComponent[] = [];
  const skipped: unknown[] = [];
  const now = new Date().toISOString();
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!entry || typeof entry !== "object") {
      skipped.push(entry);
      continue;
    }
    const e = entry as Record<string, unknown>;
    const name = str(e.name);
    if (!name) {
      skipped.push(entry);
      continue;
    }
    const target =
      e.target && typeof e.target === "object"
        ? (e.target as Record<string, unknown>)
        : null;
    components.push({
      id: str(e.id) ?? slug(name),
      name,
      kind: kindOf(e.kind),
      language: str(e.language),
      framework: str(e.framework),
      version: str(e.version),
      logo:
        str(e.logo) ??
        resolveTechLogoId(str(e.framework)) ??
        resolveTechLogoId(str(e.language)) ??
        undefined,
      summary: str(e.summary),
      evidence: strList(e.evidence),
      target: target
        ? {
            language: str(target.language),
            framework: str(target.framework),
            logo:
              str(target.logo) ??
              resolveTechLogoId(str(target.framework)) ??
              resolveTechLogoId(str(target.language)) ??
              undefined,
            note: str(target.note),
          }
        : undefined,
      at: now,
    });
  }
  return { components, skipped };
}

function parseOptions(raw: unknown): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const label = str(e.label);
    if (!label) continue;
    options.push({
      id: str(e.id) ?? slug(label),
      label,
      description: str(e.description),
      logo: str(e.logo) ?? resolveTechLogoId(label) ?? undefined,
      recommended: e.recommended === true,
    });
  }
  return options;
}

function parseSteps(raw: unknown): { steps: PlanStep[]; invalid: unknown[] } {
  const steps: PlanStep[] = [];
  const invalid: unknown[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!entry || typeof entry !== "object") {
      invalid.push(entry);
      continue;
    }
    const e = entry as Record<string, unknown>;
    const title = str(e.title);
    const phase = phaseOf(e.phase);
    if (!title || !phase) {
      invalid.push(entry);
      continue;
    }
    steps.push({
      id: str(e.id) ?? `${phase}-${slug(title)}`,
      phase,
      title,
      status: statusOf(e.status) ?? "pending",
      note: str(e.note),
      weight: num(e.weight),
    });
  }
  return { steps, invalid };
}

function parseStats(raw: unknown): ProgressStats | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const extra: Record<string, string> = {};
  if (s.extra && typeof s.extra === "object") {
    for (const [k, v] of Object.entries(s.extra as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") extra[k] = String(v);
    }
  }
  const stats: ProgressStats = {
    filesTotal: num(s.files_total),
    filesDone: num(s.files_done),
    testsTotal: num(s.tests_total),
    testsPassing: num(s.tests_passing),
    endpointsTotal: num(s.endpoints_total),
    endpointsDone: num(s.endpoints_done),
    extra: Object.keys(extra).length ? extra : undefined,
  };
  // Drop undefined keys so merging never erases a known counter.
  return Object.fromEntries(
    Object.entries(stats).filter(([, v]) => v !== undefined),
  ) as ProgressStats;
}

export async function handleModernizationControlAction(
  action: ModernizationControlAction,
  context: DispatchContext,
): Promise<void> {
  const store = useModernizationStudioStore.getState();
  const payload = payloadOf(action);

  if (!isCommand(action.command)) {
    postReceipt(context, {
      status: "rejected",
      reason: "unknown_command",
      valid_commands: MODERNIZATION_CONTROL_COMMANDS,
    });
    return;
  }

  const project = findProjectForConversation(context.conversationId);
  if (!project) {
    postReceipt(context, {
      status: "rejected",
      reason: "no_project",
      guidance:
        "This conversation is not attached to a Neo ME project. Ask the user to open the studio from the Neo ME page.",
    });
    return;
  }
  const projectId = project.id;
  const now = new Date().toISOString();

  switch (action.command) {
    case "describe": {
      postReceipt(context, { status: "ok", ...describeProject(project) });
      return;
    }

    case "record_discovery": {
      const scan = scanForSecrets(payload);
      if (!scan.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "looks_like_credential",
          detail: scan.reason,
          guidance:
            "Never record secrets. Reference them by environment-variable name.",
        });
        return;
      }
      const { components, skipped } = parseComponents(payload.components);
      if (components.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_components",
          shape: COMMAND_SHAPES.record_discovery,
          skipped,
        });
        return;
      }
      store.upsertComponents(projectId, components);
      if (project.status === "intake")
        store.setStatus(projectId, "discovering");
      store.appendLog(projectId, {
        id: newModernizationId("log"),
        level: "info",
        text: `Discovered ${components.map((c) => c.name).join(", ")}`,
        at: now,
      });
      postReceipt(context, {
        status: "ok",
        recorded: [...new Set(components.map((c) => c.id))],
        skipped: skipped.length ? skipped : undefined,
        components_total:
          useModernizationStudioStore.getState().projects[projectId]?.components
            .length ?? components.length,
      });
      return;
    }

    case "ask_choice": {
      const title = str(payload.title);
      const options = parseOptions(payload.options);
      const kind = str(payload.kind) === "multi" ? "multi" : "single";
      if (!title || options.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: !title ? "missing_title" : "no_options",
          shape: COMMAND_SHAPES.ask_choice,
        });
        return;
      }
      const question: ChoiceQuestion = {
        id: str(payload.question_id) ?? slug(title),
        title,
        prompt: str(payload.prompt),
        kind,
        options,
        allowOther: payload.allow_other !== false,
        componentId: str(payload.component_id),
        status: "open",
        selected: [],
        at: now,
      };
      store.askQuestion(projectId, question);
      if (project.status === "intake" || project.status === "discovering") {
        store.setStatus(projectId, "interviewing");
      }
      postReceipt(context, {
        status: "pending_user",
        question_id: question.id,
        guidance:
          "The card is on screen. Tell the user in one short sentence to pick on the right, then stop and wait for the answered receipt.",
      });
      return;
    }

    case "set_plan": {
      const { steps, invalid } = parseSteps(payload.steps);
      if (steps.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_valid_steps",
          shape: COMMAND_SHAPES.set_plan,
          invalid,
        });
        return;
      }
      if (project.components.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "discovery_required",
          guidance:
            "Call record_discovery for the legacy stack before planning.",
        });
        return;
      }
      const currentStepId =
        str(payload.current_step_id) ??
        steps.find((s) => s.status === "active")?.id ??
        null;
      store.setPlan(projectId, steps, currentStepId);
      store.appendLog(projectId, {
        id: newModernizationId("log"),
        level: "success",
        text: `Plan published: ${steps.length} steps`,
        at: now,
      });
      postReceipt(context, {
        status: "ok",
        steps: steps.map((s) => s.id),
        invalid: invalid.length ? invalid : undefined,
      });
      return;
    }

    case "request_approval": {
      const what = str(payload.what);
      if (!what) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_what",
          shape: COMMAND_SHAPES.request_approval,
        });
        return;
      }
      const id = str(payload.approval_id) ?? newModernizationId("ap");
      store.requestApproval(projectId, {
        id,
        what,
        why: str(payload.why),
        status: "pending",
        at: now,
      });
      postReceipt(context, {
        status: "pending_user",
        approval_id: id,
        guidance:
          "Tell the user in one sentence what you are waiting on, then stop until the approval receipt arrives.",
      });
      return;
    }

    case "update_progress": {
      const stepId = str(payload.step_id);
      const status = statusOf(payload.status);
      const stats = parseStats(payload.stats);
      const note = str(payload.note);
      if (!stepId && !stats) {
        postReceipt(context, {
          status: "rejected",
          reason: "nothing_to_update",
          shape: COMMAND_SHAPES.update_progress,
        });
        return;
      }
      if (stepId) {
        if (!project.plan.some((s) => s.id === stepId)) {
          postReceipt(context, {
            status: "rejected",
            reason: "unknown_step",
            known_steps: project.plan.map((s) => s.id),
          });
          return;
        }
        if (status || note) {
          store.updateStep(projectId, stepId, {
            ...(status ? { status } : {}),
            ...(note ? { note } : {}),
          });
        }
        if (status === "active") {
          store.setCurrentStep(projectId, stepId);
          // The project status follows the phase being worked on, so the
          // header and the list read right without the agent managing it.
          const phase = project.plan.find((s) => s.id === stepId)?.phase;
          if (phase === "understand") store.setStatus(projectId, "discovering");
          else if (phase === "interview")
            store.setStatus(projectId, "interviewing");
          else if (phase === "specify" || phase === "characterize")
            store.setStatus(projectId, "planned");
          else if (phase === "verify" || phase === "report")
            store.setStatus(projectId, "verifying");
          else if (phase) store.setStatus(projectId, "migrating");
        }
        if (status === "failed") {
          store.appendLog(projectId, {
            id: newModernizationId("log"),
            level: "error",
            text: `${stepId} failed${note ? `: ${note}` : ""}`,
            stepId,
            at: now,
          });
        } else if (status === "done") {
          store.appendLog(projectId, {
            id: newModernizationId("log"),
            level: "success",
            text: `${project.plan.find((s) => s.id === stepId)?.title ?? stepId} done`,
            stepId,
            at: now,
          });
        }
      }
      if (stats) store.mergeStats(projectId, stats);
      const after = useModernizationStudioStore.getState().projects[projectId];
      const progress = after ? planProgress(after.plan) : null;
      postReceipt(context, {
        status: "ok",
        step_id: stepId,
        progress: progress
          ? { steps_done: progress.done, steps_total: progress.total }
          : undefined,
      });
      return;
    }

    case "log": {
      const text = str(payload.text);
      if (!text) {
        postReceipt(context, { status: "rejected", reason: "missing_text" });
        return;
      }
      const level = str(payload.level);
      store.appendLog(projectId, {
        id: newModernizationId("log"),
        level:
          level === "warn" || level === "error" || level === "success"
            ? level
            : "info",
        text: text.slice(0, 400),
        stepId: str(payload.step_id),
        at: now,
      });
      // Logs are fire-and-forget: no receipt, or the agent would spend a
      // model call acknowledging every line.
      return;
    }

    case "checkpoint": {
      const label = str(payload.label);
      if (!label) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_label",
          shape: COMMAND_SHAPES.checkpoint,
        });
        return;
      }
      const scan = scanForSecrets(payload);
      if (!scan.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "looks_like_credential",
          detail: scan.reason,
        });
        return;
      }
      const state =
        payload.state && typeof payload.state === "object"
          ? (payload.state as Record<string, unknown>)
          : {};
      const id = newModernizationId("cp");
      store.addCheckpoint(projectId, {
        id,
        label,
        stepId: str(payload.step_id),
        state,
        at: now,
      });
      postReceipt(context, { status: "ok", checkpoint_id: id });
      return;
    }

    case "complete": {
      const pending = project.plan.filter(
        (s) => s.status === "pending" || s.status === "active",
      );
      if (pending.length > 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "steps_pending",
          pending: pending.map((s) => s.id),
          guidance:
            "Finish, skip (with a reason) or fail every step before completing.",
        });
        return;
      }
      const summary = str(payload.summary);
      if (!summary) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_summary",
          shape: COMMAND_SHAPES.complete,
        });
        return;
      }
      store.setReport(projectId, {
        summary,
        verification:
          payload.verification && typeof payload.verification === "object"
            ? (payload.verification as Record<string, unknown>)
            : undefined,
        artifacts: strList(payload.artifacts),
        at: now,
      });
      store.appendLog(projectId, {
        id: newModernizationId("log"),
        level: "success",
        text: "Migration complete",
        at: now,
      });
      postReceipt(context, { status: "ok", completed: true });
      return;
    }

    default: {
      const never: never = action.command;
      postReceipt(context, {
        status: "rejected",
        reason: "unhandled",
        command: never,
      });
    }
  }
}
