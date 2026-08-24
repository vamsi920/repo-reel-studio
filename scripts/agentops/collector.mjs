/**
 * Server-side collector: tails the agent-server and keeps the store current.
 *
 * This runs in the sidecar rather than in the browser on purpose. A control
 * tower whose telemetry only exists while someone has a tab open is not a
 * control tower: runs would vanish on reload, overnight and headless runs would
 * never be recorded, and the audit log would be per-browser. The collector polls
 * the agent-server's REST API, which is the durable source.
 */

import {
  RunAggregator,
  createRun,
  isActiveStatus,
  isTerminalStatus,
  normalizeRunStatus,
} from "./map-events.mjs";
import { computeSpend, evaluateBudgets, monthStart } from "./policy.mjs";

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 15000;
/** Events pulled per request while catching up on a busy conversation. */
const EVENT_PAGE_SIZE = 100;

/**
 * Identify the agent behind a conversation.
 *
 * The agent-server's `ConversationInfo` has no human agent name — `agent.kind`
 * is a pydantic discriminator. So: the launching agent profile if there was
 * one, else the ACP server identity, else a generic label. Never the model,
 * which is shown in its own column and would make the Agent column change
 * mid-run on a model switch.
 */
export function deriveAgentName(conversation) {
  const profileId = conversation?.launched_agent_profile?.agent_profile_id;
  if (typeof profileId === "string" && profileId) return profileId;
  const acpServer = conversation?.agent?.acp_server;
  if (typeof acpServer === "string" && acpServer) return acpServer;
  return "OpenHands Agent";
}

export function deriveModel(conversation) {
  return (
    conversation?.current_model_name ??
    conversation?.agent?.llm?.model ??
    conversation?.agent?.acp_model ??
    null
  );
}

export function deriveWorkspaceId(conversation) {
  const workingDir = conversation?.workspace?.working_dir;
  return typeof workingDir === "string" && workingDir ? workingDir : "unknown";
}

export class Collector {
  constructor({
    client,
    store,
    logger = console,
    now = () => new Date().toISOString(),
  }) {
    this.client = client;
    this.store = store;
    this.logger = logger;
    this.now = now;

    /** runId → { aggregator, cursor } */
    this.tracked = new Map();
    this.timer = null;
    this.stopped = false;
    this.lastError = null;
    this.lastTickAt = null;
  }

  start() {
    if (this.timer) return;
    const tick = async () => {
      if (this.stopped) return;
      let delay = IDLE_POLL_MS;
      try {
        const hasActive = await this.tick();
        delay = hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS;
        this.lastError = null;
      } catch (error) {
        // A collector that dies on a transient agent-server restart is worse
        // than one that logs and retries — the run it was watching is still
        // running.
        this.lastError = error.message;
        this.logger.error(`[agentops] poll failed: ${error.message}`);
      }
      if (!this.stopped) this.timer = setTimeout(tick, delay);
    };
    this.timer = setTimeout(tick, 0);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** @returns {Promise<boolean>} whether any run is currently active. */
  async tick() {
    const observedAt = this.now();
    this.lastTickAt = observedAt;
    const page = await this.client.searchConversations({ limit: 50 });
    const conversations = Array.isArray(page?.items) ? page.items : [];

    let hasActive = false;
    for (const conversation of conversations) {
      if (!conversation?.id) continue;
      const status = normalizeRunStatus(conversation.execution_status);
      if (isActiveStatus(status)) hasActive = true;
      await this.#syncConversation(conversation, observedAt);
    }
    return hasActive;
  }

  async #trackerFor(conversation, observedAt) {
    const runId = conversation.id;
    const existing = this.tracked.get(runId);
    if (existing) return existing;

    const stored = await this.store.getRun(runId);
    const run =
      stored ??
      createRun(
        {
          id: runId,
          workspaceId: deriveWorkspaceId(conversation),
          agentName: deriveAgentName(conversation),
          title: conversation.title,
          executionStatus: conversation.execution_status,
          model: deriveModel(conversation),
          createdAt: conversation.created_at,
        },
        observedAt,
      );

    const tracker = {
      aggregator: new RunAggregator(run),
      /** ISO timestamp to resume the event tail from. */
      cursor: run.lastEventTimestamp ?? null,
      /** Event ids already folded in at exactly `cursor`, to avoid re-counting. */
      seenAtCursor: new Set(run.lastEventIds ?? []),
      /** Whether the store has this run's first record yet. */
      isNew: !stored,
    };
    this.tracked.set(runId, tracker);
    return tracker;
  }

  async #syncConversation(conversation, observedAt) {
    const runId = conversation.id;
    const tracker = await this.#trackerFor(conversation, observedAt);
    const { aggregator } = tracker;
    const run = aggregator.run;

    // Identity can change mid-run (a title is generated, a model is switched).
    run.task = conversation.title ?? run.task;
    run.workspaceId = deriveWorkspaceId(conversation);
    run.agentName = deriveAgentName(conversation);
    const model = deriveModel(conversation);
    if (model) run.model = model;
    run.updatedAt = conversation.updated_at ?? observedAt;

    const spans = [];
    const audit = [];

    const statusResult = aggregator.applyStatus(
      conversation.execution_status,
      observedAt,
    );
    audit.push(...statusResult.audit);

    const statsResult = aggregator.applyStats(conversation.stats, observedAt);
    spans.push(...statsResult.spans);

    const eventResult = await this.#tailEvents(tracker, runId);
    spans.push(...eventResult.spans);
    audit.push(...eventResult.audit);

    // Persist the cursor with the run so a collector restart resumes rather
    // than replaying the whole conversation.
    run.lastEventTimestamp = tracker.cursor;
    run.lastEventIds = [...tracker.seenAtCursor];

    const budgetAudit = await this.#enforceBudgets(run, observedAt);
    audit.push(...budgetAudit);

    if (aggregator.run.status === "waiting_for_confirmation") {
      audit.push(
        ...(await this.#raiseConfirmationApproval(aggregator, observedAt)),
      );
    }

    await this.store.appendSpans(runId, spans);
    for (const record of audit) {
      await this.store.appendAudit({
        at: observedAt,
        actor: "system",
        ...record,
        entityType: "run",
        entityId: runId,
        workspaceId: run.workspaceId,
      });
    }
    await this.store.upsertRun(run);
    tracker.isNew = false;

    if (isTerminalStatus(run.status)) {
      // Stop holding aggregator state for finished runs; the store has it.
      this.tracked.delete(runId);
    }
  }

  async #tailEvents(tracker, runId) {
    const spans = [];
    const audit = [];
    let pageId;
    let guard = 0;

    // `timestamp__gte` + id dedupe gives incremental tailing without replaying
    // the whole event log every poll. Page ids are opaque and reset once a page
    // is exhausted, so the timestamp is the durable cursor.
    while (guard < 50) {
      guard += 1;
      const params = { limit: EVENT_PAGE_SIZE, pageId };
      if (tracker.cursor) params.timestampGte = tracker.cursor;
      const page = await this.client.searchEvents(runId, params);
      const items = Array.isArray(page?.items) ? page.items : [];
      if (!items.length) break;

      for (const event of items) {
        if (!event?.id) continue;
        if (tracker.seenAtCursor.has(event.id)) continue;

        const result = tracker.aggregator.applyEvent(event);
        spans.push(...result.spans);
        audit.push(
          ...result.audit.map((entry) => ({
            ...entry,
            at: entry.at ?? event.timestamp,
          })),
        );

        if (event.timestamp !== tracker.cursor) {
          tracker.cursor = event.timestamp;
          tracker.seenAtCursor = new Set();
        }
        tracker.seenAtCursor.add(event.id);
        tracker.aggregator.run.lastEventId = event.id;
      }

      pageId = page?.next_page_id ?? null;
      if (!pageId) break;
    }

    return { spans, audit };
  }

  /**
   * Apply budget policy to a live run.
   *
   * A breach halts the run for real (`/interrupt`) and opens an approval, so a
   * human decides whether to raise the limit or cancel. Warnings only report.
   */
  async #enforceBudgets(run, observedAt) {
    if (!isActiveStatus(run.status)) return [];

    const [policy, agentBudgetUsd, runs] = await Promise.all([
      this.store.getWorkspacePolicy(run.workspaceId),
      this.store.getAgentBudget(run.agentName),
      this.store.listRuns({ limit: 10000 }),
    ]);
    const since = monthStart(observedAt);
    const workspaceSpend = computeSpend(runs, {
      workspaceId: run.workspaceId,
      since,
    }).usedUsd;
    const agentSpend = computeSpend(runs, {
      agentName: run.agentName,
      since,
    }).usedUsd;

    const { breaches, warnings } = evaluateBudgets({
      run,
      policy,
      agentBudgetUsd,
      workspaceSpend,
      agentSpend,
    });

    const audit = [];

    for (const warning of warnings) {
      const key = `${run.workspaceId}:${warning.thresholdPct}:${new Date(since).getUTCMonth()}`;
      if (this.#alreadyWarned(key)) continue;
      audit.push({
        action: "budget.warning",
        summary: warning.message,
        at: observedAt,
        metadata: warning,
      });
    }

    if (!breaches.length) return audit;

    const pendingApprovals = await this.store.listApprovals({ state: "pending" });
    const existing = pendingApprovals.find(
      (a) => a.kind === "budget" && a.runId === run.runId,
    );
    if (existing) return audit;

    const breach = breaches[0];
    try {
      await this.client.interruptConversation(run.runId);
      audit.push({
        action: "budget.exceeded",
        summary: breach.message,
        at: observedAt,
        metadata: { breaches },
      });
      audit.push({
        action: "run.paused",
        summary: "Run halted because a budget was exceeded",
        at: observedAt,
      });
    } catch (error) {
      // Report the failure rather than pretending the run was stopped.
      audit.push({
        action: "budget.exceeded",
        summary: `${breach.message} (halting the run FAILED: ${error.message})`,
        at: observedAt,
        metadata: { breaches, haltFailed: true },
      });
    }

    await this.store.upsertApproval({
      id: `budget:${run.runId}:${observedAt}`,
      kind: "budget",
      state: "pending",
      runId: run.runId,
      workspaceId: run.workspaceId,
      agentName: run.agentName,
      title: `Budget exceeded — ${run.task}`,
      what: breach.message,
      why: `${breach.scope} budget of $${breach.limitUsd.toFixed(2)} reached ($${breach.usedUsd.toFixed(4)} spent).`,
      estimatedCostUsd: run.costUsd,
      requestedAt: observedAt,
      breaches,
    });

    return audit;
  }

  #alreadyWarned(key) {
    this.warned ??= new Set();
    if (this.warned.has(key)) return true;
    this.warned.add(key);
    return false;
  }

  /**
   * Mirror the runtime's own confirmation wait into the approvals queue.
   *
   * The agent is genuinely blocked here — the agent-server set
   * `waiting_for_confirmation` and will not proceed until
   * `/events/respond_to_confirmation` answers. The queue entry is a view onto
   * that, not a second gate of our own.
   */
  async #raiseConfirmationApproval(aggregator, observedAt) {
    const run = aggregator.run;
    const pendingApprovals = await this.store.listApprovals({ state: "pending" });
    const existing = pendingApprovals.find(
      (a) => a.kind === "confirmation" && a.runId === run.runId,
    );
    if (existing) return [];

    // The open tool span is exactly the action the runtime is waiting on.
    const [pending] = [...aggregator.openToolSpans.values()].slice(-1);
    const policy = await this.store.getWorkspacePolicy(run.workspaceId);

    await this.store.upsertApproval({
      id: `confirmation:${run.runId}:${observedAt}`,
      kind: "confirmation",
      state: "pending",
      runId: run.runId,
      workspaceId: run.workspaceId,
      agentName: run.agentName,
      title: pending
        ? `${run.agentName} wants to run ${pending.name}`
        : `${run.agentName} is waiting for confirmation`,
      what: pending?.attributes?.["tool.parameters"] ?? null,
      why:
        pending?.attributes?.["neodevex.action.summary"] ??
        "The agent requested confirmation before proceeding.",
      toolName: pending?.name ?? null,
      securityRisk: pending?.attributes?.["neodevex.security_risk"] ?? null,
      artifacts: run.artifacts.slice(-5),
      estimatedCostUsd: run.costUsd,
      autonomyLevel: policy.autonomyLevel,
      requestedAt: observedAt,
    });

    return [
      {
        action: "approval.requested",
        summary: pending
          ? `Confirmation requested for ${pending.name}`
          : "Confirmation requested",
        at: observedAt,
        actor: "agent",
      },
    ];
  }

  health() {
    return {
      status: "ok",
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      trackedRuns: this.tracked.size,
    };
  }
}
