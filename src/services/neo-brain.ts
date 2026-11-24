/**
 * Neo Brain: the background learning loop over workspace memory.
 *
 *   work -> correction or recovery -> route to a layer -> (review) -> store
 *        -> consolidate (reinforce / decay) -> BRAIN.md in the workspace
 *        -> every later conversation in that project starts smarter.
 *
 * Producers call `ingestUserMessage` / `ingestRunObservation` and move on;
 * nothing here blocks a render or a send. Storage is workspace memory
 * (`submitMemoryCandidate`), which already gates, supersedes, persists,
 * mirrors to the workspace file and syncs to Supabase for the team.
 */
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import {
  readRecords,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";
import {
  brainMapPointer,
  buildBrainMapCommands,
  mapFingerprint,
  renderBrainMap,
} from "#/lib/neo-brain/brain-map";
import { consolidate } from "#/lib/neo-brain/consolidate";
import {
  extractLearnings,
  type LearnContext,
} from "#/lib/neo-brain/corrections";
import { learningKey } from "#/lib/neo-brain/learning-key";
import type { BrainLearning } from "#/lib/neo-brain/types";
import {
  drainMemoryUpdater,
  submitMemoryCandidate,
  WorkspaceContextService,
} from "#/lib/workspace-memory";
import type { WorkspaceActivityEvent } from "#/lib/workspace-memory";
import { useNeoBrainStore } from "#/stores/neo-brain-store";
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";

/** The article's "weekly" pass, run daily because it is free. */
export const CONSOLIDATE_EVERY_MS = 20 * 60 * 60 * 1000;

export interface LearnResult {
  stored: BrainLearning[];
  queuedForReview: BrainLearning[];
  reinforced: BrainLearning[];
  skipped: BrainLearning[];
}

function publish(
  workspaceId: string,
  kind: WorkspaceActivityEvent["kind"],
  summary: string,
): void {
  useWorkspaceMemoryStore.getState().pushActivity({
    id: `brain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    at: new Date().toISOString(),
    kind,
    summary,
  });
}

function quote(text: string): string {
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function activeKeys(workspaceId: string): Set<string> {
  return new Set(
    readRecords(workspaceId)
      .filter((record) => record.status !== "superseded")
      .map((record) =>
        learningKey(record.kind, record.subject, record.statement),
      ),
  );
}

/** Routes learnings: store, queue for review, or count as heard again. */
export function learn(
  workspaceId: string,
  learnings: readonly BrainLearning[],
  conversationId: string | null,
): LearnResult {
  const result: LearnResult = {
    stored: [],
    queuedForReview: [],
    reinforced: [],
    skipped: [],
  };
  if (!workspaceId || learnings.length === 0) return result;

  const store = useNeoBrainStore.getState();
  const known = activeKeys(workspaceId);
  const dismissed = new Set(store.dismissed[workspaceId] ?? []);

  learnings.forEach((learning) => {
    if (dismissed.has(learning.key)) {
      result.skipped.push(learning);
      return;
    }
    const sighting = store.recordSighting(
      workspaceId,
      learning.key,
      conversationId,
      learning.createdAt,
    );

    if (known.has(learning.key)) {
      result.reinforced.push(learning);
      publish(
        workspaceId,
        "learned",
        `Neo Brain: heard "${quote(learning.candidate.statement)}" again (${sighting.conversations.length} conversation(s))`,
      );
      return;
    }

    if (learning.needsReview) {
      if (store.addPending(workspaceId, learning)) {
        result.queuedForReview.push(learning);
        publish(
          workspaceId,
          "learned",
          `Neo Brain: "${quote(learning.candidate.statement)}" is waiting for review`,
        );
      } else {
        result.skipped.push(learning);
      }
      return;
    }

    submitMemoryCandidate(learning.candidate);
    known.add(learning.key);
    result.stored.push(learning);
    publish(
      workspaceId,
      "learned",
      `Neo Brain: learned a ${learning.layer}: "${quote(learning.candidate.statement)}"`,
    );
  });

  return result;
}

export function ingestUserMessage(
  message: string,
  context: LearnContext,
): LearnResult {
  return learn(
    context.workspaceId,
    extractLearnings(message, context),
    context.conversationId,
  );
}

/** Tokens of project knowledge a new conversation starts with. */
export const START_CONTEXT_BUDGET_TOKENS = 1500;

/**
 * What a brand-new conversation in this project should already know. The
 * first message never goes through `useSendMessage`, so without this a new
 * conversation started with none of the brain. Returns "" when the project
 * has nothing learned yet.
 */
export function buildStartBrainContext(params: {
  workspaceId: string | null;
  task: string | undefined;
  repositoryId?: string | null;
}): string {
  if (!params.workspaceId) return "";
  const context = WorkspaceContextService.buildContext({
    workspaceId: params.workspaceId,
    // An empty task still ranks pinned rules and gates first.
    task: params.task?.trim() || "start of a new conversation in this project",
    conversationId: null,
    tokenBudget: START_CONTEXT_BUDGET_TOKENS,
    repositoryId: params.repositoryId ?? undefined,
  });
  const mapWritten = Boolean(
    useNeoBrainStore.getState().lastMapFingerprint[params.workspaceId],
  );
  return [context.text, mapWritten ? brainMapPointer() : ""]
    .filter(Boolean)
    .join("\n\n");
}

export function listPending(workspaceId: string): BrainLearning[] {
  return useNeoBrainStore.getState().pending[workspaceId] ?? [];
}

/** A person vouched for it: it becomes a user decision and is stored now. */
export function approvePending(workspaceId: string, id: string): boolean {
  const learning = useNeoBrainStore.getState().removePending(workspaceId, id);
  if (!learning) return false;
  submitMemoryCandidate({
    ...learning.candidate,
    confidence: 0.85,
    tags: [...(learning.candidate.tags ?? []), "reviewed"],
    provenance: {
      ...learning.candidate.provenance,
      source: "user-decision",
      sourceId: "neo-brain:approved",
    },
  });
  drainMemoryUpdater();
  publish(
    workspaceId,
    "learned",
    `Neo Brain: approved "${quote(learning.candidate.statement)}"`,
  );
  return true;
}

/** Turned down: dropped and never proposed again for this workspace. */
export function dismissPending(workspaceId: string, id: string): boolean {
  const store = useNeoBrainStore.getState();
  const learning = store.removePending(workspaceId, id);
  if (!learning) return false;
  store.dismiss(workspaceId, learning.key);
  publish(
    workspaceId,
    "rejected",
    `Neo Brain: dismissed "${quote(learning.candidate.statement)}"`,
  );
  return true;
}

export interface ConsolidateResult {
  ran: boolean;
  reinforced: number;
  pinned: number;
  decayed: number;
}

/** The background "gets smarter" pass. Cheap, idempotent, at most daily. */
export function consolidateWorkspace(
  workspaceId: string,
  options: { now?: Date; force?: boolean } = {},
): ConsolidateResult {
  const none = { ran: false, reinforced: 0, pinned: 0, decayed: 0 };
  if (!workspaceId) return none;
  const now = options.now ?? new Date();
  const store = useNeoBrainStore.getState();
  const last = Date.parse(store.lastConsolidatedAt[workspaceId] ?? "") || 0;
  if (!options.force && now.getTime() - last < CONSOLIDATE_EVERY_MS) {
    return none;
  }

  // Learnings submitted moments ago must be in the records we fold.
  drainMemoryUpdater();
  const report = consolidate(
    readRecords(workspaceId),
    store.sightings[workspaceId] ?? {},
    now,
  );
  store.markConsolidated(workspaceId, now.toISOString());
  if (report.changed) {
    writeRecords(workspaceId, report.records);
    WorkspaceContextService.invalidate(workspaceId);
    publish(
      workspaceId,
      "cache-refreshed",
      `Neo Brain: consolidated (${report.reinforced.length} reinforced, ${report.pinned.length} pinned, ${report.decayed.length} marked stale)`,
    );
  }
  return {
    ran: true,
    reinforced: report.reinforced.length,
    pinned: report.pinned.length,
    decayed: report.decayed.length,
  };
}

export function renderWorkspaceBrainMap(
  workspaceId: string,
  options: { now?: Date; projectName?: string } = {},
): string {
  return renderBrainMap({
    records: readRecords(workspaceId),
    pendingReview: listPending(workspaceId).length,
    generatedAt: (options.now ?? new Date()).toISOString(),
    projectName: options.projectName,
  });
}

export interface BrainRuntimeContext {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string;
}

export interface ExportResult {
  ok: boolean;
  written: boolean;
  error?: string;
}

/** Writes BRAIN.md into the workspace when it changed (or when forced). */
export async function exportBrainMap(
  workspaceId: string,
  runtime: BrainRuntimeContext,
  options: { force?: boolean; projectName?: string } = {},
): Promise<ExportResult> {
  if (!workspaceId || !runtime.conversationUrl || !runtime.workingDir) {
    return { ok: false, written: false, error: "no live runtime" };
  }
  const content = renderWorkspaceBrainMap(workspaceId, {
    projectName: options.projectName,
  });
  const fingerprint = mapFingerprint(content);
  const store = useNeoBrainStore.getState();
  if (!options.force && store.lastMapFingerprint[workspaceId] === fingerprint) {
    return { ok: true, written: false };
  }
  try {
    for (const command of buildBrainMapCommands(content)) {
      // Sequential on purpose: chunked writes to one file must stay ordered.
      const result = await AgentServerRuntimeService.executeCommand(
        runtime.conversationUrl,
        runtime.sessionApiKey,
        command,
        runtime.workingDir,
        30,
      );
      if (result.exit_code !== 0) {
        return {
          ok: false,
          written: false,
          error: result.stderr?.trim() || "brain map export failed",
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      written: false,
      error: error instanceof Error ? error.message : "brain map export failed",
    };
  }
  store.markMapWritten(workspaceId, fingerprint);
  return { ok: true, written: true };
}
