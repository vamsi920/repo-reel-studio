/**
 * Server-side collector: tails the agent-server and keeps the store current.
 *
 * This runs in the sidecar rather than in the browser on purpose. A control
 * tower whose telemetry only exists while someone has a tab open is not a
 * control tower: runs would vanish on reload, overnight and headless runs would
 * never be recorded, and the audit log would be per-browser. The collector polls
 * the agent-server's REST API, which is the durable source, and — for runs that
 * are active — also listens on the conversation's events websocket, which is
 * the only source that reports a tool call *while* it is executing.
 *
 * The websocket path must never wait on a REST call. While the runtime is
 * inside a tool call it holds the conversation's state lock, and every REST
 * read that needs that lock (`conversations/search` composes each open
 * conversation's info under it) blocks until the tool returns — a `sleep 150`
 * stalls the poll for 150 s. Events that reach the socket in that window are
 * therefore persisted the moment they arrive (`#flushLiveEvents`), on their
 * own per-run write queue, and the poll catches up with the cursor whenever
 * the runtime answers again.
 *
 * The poll's search is the only way a *new* run is discovered, so it waits
 * for that lock rather than giving up at the client's 30 s default
 * (`DISCOVERY_TIMEOUT_MS`). The lock is FIFO: the search is answered the
 * moment the current step ends, so a run of back-to-back long commands is
 * tracked after at most one step. Aborting at 30 s and retrying 15 s later
 * meant every poll straddled a step and such a run was never seen at all
 * until it had finished — no socket, so no live cost, so no budget halt.
 */

import {
  RunAggregator,
  createRun,
  isActiveStatus,
  isTerminalStatus,
  normalizeRunStatus,
  normalizeTimestamp,
} from "./map-events.mjs";
import {
  AgentOpsSpanKindValues,
  ToolAttributes,
  ToolStatus,
} from "../../vendor/agentops/semconv/index.mjs";
import { computeSpend, evaluateBudgets, monthStart } from "./policy.mjs";

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 15000;
/**
 * How long the discovery search may wait behind a conversation's state lock
 * before it is abandoned and retried. Bounded by the longest single step the
 * runtime will run, not by "how long should an HTTP call take".
 */
const DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000;
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

/**
 * Order two runtime timestamps; `null` sorts first. Compared as instants (via
 * normalizeTimestamp) so a zoned stored cursor and a naive event agree.
 */
function compareTimestamps(a, b) {
  if (!b) return a ? 1 : 0;
  if (!a) return -1;
  const left = Date.parse(normalizeTimestamp(a));
  const right = Date.parse(normalizeTimestamp(b));
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return a === b ? 0 : a > b ? 1 : -1;
  }
  return left === right ? 0 : left > right ? 1 : -1;
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
    this.liveEventsReceived = 0;
    this.lastLiveEventAt = null;
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
    for (const tracker of this.tracked.values()) this.#closeLiveStream(tracker);
  }

  /** @returns {Promise<boolean>} whether any run is currently active. */
  async tick() {
    this.lastTickAt = this.now();
    const page = await this.client.searchConversations({
      limit: 50,
      timeoutMs: DISCOVERY_TIMEOUT_MS,
    });
    // Dated *after* the search answers: it can sit behind the runtime's state
    // lock for a whole step (up to DISCOVERY_TIMEOUT_MS), and a run first
    // seen then must not look like it was seen when the tick began.
    const observedAt = this.now();
    const conversations = Array.isArray(page?.items) ? page.items : [];

    let hasActive = false;
    const seen = new Set();
    for (const conversation of conversations) {
      if (!conversation?.id) continue;
      seen.add(conversation.id);
      const status = normalizeRunStatus(conversation.execution_status);
      if (isActiveStatus(status)) hasActive = true;
      await this.#syncConversation(conversation, observedAt);
    }
    // Trackers are kept for finished runs (see #syncConversation), so drop
    // the ones whose conversation has left the search page; the store has
    // everything they held.
    for (const [runId, tracker] of this.tracked) {
      if (seen.has(runId)) continue;
      this.#closeLiveStream(tracker);
      this.tracked.delete(runId);
    }
    await this.#closeOrphanedRuns(seen, observedAt);
    return hasActive;
  }

  /**
   * Close out stored runs whose conversation no longer exists at the runtime.
   *
   * A conversation deleted mid-run (from the chat sidebar, or by a QA run
   * cleaning up after itself) simply stops appearing on the search page. The
   * poll only ever folds in statuses the runtime reports, and a conversation
   * that is gone reports nothing — so the stored run kept its last live
   * status (paused, typically, after a budget halt) forever: counted by the
   * Active Agents tile, listed in Live Runs with a ticking clock, offering
   * Resume/Stop buttons that could only 409. Pruning the tracker above is not
   * enough; the store's copy is what the API serves.
   *
   * Candidates are every stored active run that is not on this tick's page,
   * tracked or not (a collector restarted after the deletion never had a
   * tracker for it). Absence from the page is not proof — the page is capped
   * at 50 — so each candidate is confirmed with a direct GET and only a
   * definite 404 closes it out; a runtime error leaves it for the next tick.
   */
  async #closeOrphanedRuns(seen, observedAt) {
    if (typeof this.client.getConversation !== "function") return;
    const stored = await this.store.listRuns({
      status: "running,paused,waiting_for_confirmation",
    });
    for (const run of stored) {
      if (typeof run?.runId !== "string" || !run.runId) continue;
      if (!isActiveStatus(run.status) || seen.has(run.runId)) continue;
      try {
        await this.client.getConversation(run.runId);
        continue;
      } catch (error) {
        if (error?.status !== 404) {
          this.logger.warn(
            `[agentops] could not confirm ${run.runId} still exists: ${error.message}`,
          );
          continue;
        }
      }
      run.status = "cancelled";
      run.endedAt = observedAt;
      run.updatedAt = observedAt;
      await this.store.appendAudit({
        at: observedAt,
        actor: "system",
        action: "run.cancelled",
        summary:
          "Run closed out: its conversation was deleted from the runtime",
        entityType: "run",
        entityId: run.runId,
        workspaceId: run.workspaceId,
      });
      await this.store.upsertRun(run);
      this.logger.info(
        `[agentops] closed out ${run.runId}: conversation no longer exists at the runtime`,
      );
    }
  }

  async #trackerFor(conversation, observedAt) {
    const runId = conversation.id;
    const existing = this.tracked.get(runId);
    if (existing) return existing;

    const stored = await this.store.getRun(runId);
    // A run first seen already over (the collector was blocked behind its
    // long commands for its whole life, or was down) is seeded as not yet
    // started, so the poll's applyStatus() closes it out the way it would a
    // live run: endedAt set, task.completed / task.failed audited after the
    // tool calls tailed in that same tick. Seeding the terminal status
    // directly left such a run with no end time and no completion row.
    const firstStatus = normalizeRunStatus(conversation.execution_status);
    const closingOut = !stored && isTerminalStatus(firstStatus);
    const run =
      stored ??
      createRun(
        {
          id: runId,
          workspaceId: deriveWorkspaceId(conversation),
          agentName: deriveAgentName(conversation),
          title: conversation.title,
          executionStatus: closingOut
            ? undefined
            : conversation.execution_status,
          model: deriveModel(conversation),
          createdAt: conversation.created_at,
        },
        observedAt,
      );

    const tracker = {
      aggregator: new RunAggregator(run, {
        // A stored run with an event cursor already tailed its opening user
        // message before this collector started; the next one is a follow-up.
        taskStarted: Boolean(stored?.lastEventTimestamp),
      }),
      /** ISO timestamp to resume the event tail from. */
      cursor: run.lastEventTimestamp ?? null,
      /** Event ids already folded in at exactly `cursor`, to avoid re-counting. */
      seenAtCursor: new Set(run.lastEventIds ?? []),
      /** Whether the store has this run's first record yet. */
      isNew: !stored,
      /**
       * A never-stored run whose first observation is already terminal: its
       * end is dated by the runtime's own `updated_at`, not by when the
       * collector finally got to look.
       */
      closingOut,
      /**
       * A terminal run that a whole tick found nothing new for. Skipped on
       * later ticks until its status changes (a follow-up message can
       * restart a finished conversation).
       */
      settled: false,
      /** Open events-websocket handle for an active run, or null. */
      liveStream: null,
      /** Events received on the websocket, folded in on the next tick. */
      liveEvents: [],
      /** Wall-clock time (ms) before which a dropped socket is not re-opened. */
      liveRetryAt: 0,
      liveBackoffMs: ACTIVE_POLL_MS,
      /**
       * Per-run write queue. A socket flush and the poll both read and write
       * the same aggregator and store rows; chaining them here keeps the two
       * from interleaving without a global lock.
       */
      writes: Promise.resolve(),
      /** Whether a socket flush is already queued behind `writes`. */
      flushQueued: false,
    };
    if (stored && !isTerminalStatus(run.status)) {
      await this.#seedOpenToolSpans(tracker, runId);
    }
    this.tracked.set(runId, tracker);
    return tracker;
  }

  /**
   * Rebuild a restarted collector's view of a run's in-flight tool calls.
   *
   * A tool span reaches the store the moment its ActionEvent arrives on the
   * websocket — possibly minutes before the REST tail serves that same event
   * and moves the cursor past it. A collector restarted in that window (every
   * deploy is one) would otherwise re-count the call when the tail replays
   * it, and could not close the span when the observation finally lands,
   * because a fresh aggregator has no open span to close.
   */
  async #seedOpenToolSpans(tracker, runId) {
    const spans = await this.store.listSpans(runId);
    const prefix = `${runId}:`;
    for (const span of spans) {
      if (span?.kind !== AgentOpsSpanKindValues.TOOL) continue;
      if (typeof span.spanId === "string" && span.spanId.startsWith(prefix)) {
        tracker.aggregator.seenEventIds.add(span.spanId.slice(prefix.length));
      }
      const toolCallId = span.attributes?.[ToolAttributes.TOOL_ID];
      if (span.status === ToolStatus.EXECUTING && toolCallId) {
        tracker.aggregator.openToolSpans.set(toolCallId, span);
      }
    }
  }

  /**
   * Keep an active run subscribed to its events websocket; drop the
   * subscription once it is over. Re-opened from the REST cursor on a later
   * tick if the socket dropped, so nothing is missed in between.
   */
  #syncLiveStream(tracker, runId) {
    const run = tracker.aggregator.run;
    if (isTerminalStatus(run.status)) {
      this.#closeLiveStream(tracker);
      return;
    }
    if (tracker.liveStream && !tracker.liveStream.closed) return;
    if (typeof this.client.openEventStream !== "function") return;

    // A socket the runtime keeps refusing (auth, restart) must not be
    // re-dialled every 2 s tick; back off up to a minute, reset once it
    // delivers again.
    if (tracker.liveStream?.closed) {
      tracker.liveStream = null;
      tracker.liveRetryAt = Date.now() + tracker.liveBackoffMs;
      tracker.liveBackoffMs = Math.min(tracker.liveBackoffMs * 2, 60000);
    }
    if (Date.now() < tracker.liveRetryAt) return;

    let received = 0;
    tracker.liveStream = this.client.openEventStream(runId, {
      since: tracker.cursor,
      onOpen: () => {
        this.logger.info(`[agentops] events socket open for ${runId}`);
      },
      onEvent: (event) => {
        tracker.liveBackoffMs = ACTIVE_POLL_MS;
        this.liveEventsReceived += 1;
        this.lastLiveEventAt = this.now();
        received += 1;
        if (received === 1) {
          this.logger.info(
            `[agentops] events socket for ${runId} delivered its first event (${event?.kind ?? "unknown kind"})`,
          );
        }
        tracker.liveEvents.push(event);
        // Persist now, not on the next poll: the poll may be blocked behind
        // this very tool call for as long as it runs.
        this.#queueLiveFlush(tracker, runId);
      },
      onError: (error) => {
        this.logger.warn(
          `[agentops] events socket for ${runId}: ${error.message}`,
        );
      },
      onClose: ({ code, reason }) => {
        // 1000 is our own close at the end of a run; anything else is the
        // runtime hanging up (4001 = session key rejected) and worth a line,
        // since the re-dial backoff would otherwise hide it completely.
        if (code === 1000) return;
        this.logger.warn(
          `[agentops] events socket for ${runId} closed (${code ?? "no code"}${reason ? `: ${reason}` : ""}) after ${received} events`,
        );
      },
    });
    if (!tracker.liveStream && !this.warnedNoLiveStream) {
      this.warnedNoLiveStream = true;
      this.logger.warn(
        "[agentops] live event stream unavailable (no WebSocket in this Node); tool calls surface only once they finish",
      );
    }
  }

  #closeLiveStream(tracker) {
    tracker.liveStream?.close();
    tracker.liveStream = null;
  }

  /**
   * Fold in the events the websocket delivered since the last tick.
   *
   * These are applied through the same aggregator as the REST tail, so an
   * `ActionEvent` opens its tool span (status `executing`, `toolCallCount`
   * bumped, `tool.called` audited) right away instead of when the observation
   * lands. The REST cursor is deliberately *not* moved: the tail remains the
   * durable record of what was seen, and the aggregator's event-id set makes
   * the eventual overlap a no-op.
   */
  #drainLiveEvents(tracker) {
    const spans = [];
    const audit = [];
    let statsApplied = false;
    const events = tracker.liveEvents.splice(0);
    for (const event of events) {
      if (!event?.id) continue;
      const result = tracker.aggregator.applyEvent(event);
      spans.push(...result.spans);
      audit.push(
        ...result.audit.map((entry) => ({
          ...entry,
          at: entry.at ?? normalizeTimestamp(event.timestamp),
        })),
      );
      if (result.statsApplied) statsApplied = true;
    }
    return { spans, audit, statsApplied };
  }

  /**
   * Run `work` after every write already queued for this run, and make the
   * queue wait for it. A rejected `work` is reported to the caller but never
   * poisons the queue for the next one.
   */
  #enqueueWrite(tracker, work) {
    const next = tracker.writes.then(work, work);
    tracker.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * Schedule one socket flush for this run. Events that arrive while it is
   * queued are picked up by that same flush, so a burst costs one round of
   * store writes rather than one per event.
   */
  #queueLiveFlush(tracker, runId) {
    if (tracker.flushQueued) return;
    tracker.flushQueued = true;
    this.#enqueueWrite(tracker, async () => {
      tracker.flushQueued = false;
      try {
        await this.#flushLiveEvents(tracker, runId, this.now());
      } catch (error) {
        // The aggregator already applied these events, so the store is
        // simply behind: the observation still closes the span from the
        // REST tail later. Log rather than throw — nothing awaits this.
        this.logger.error(
          `[agentops] live flush for ${runId} failed: ${error.message}`,
        );
      }
    });
  }

  /**
   * Fold in and persist whatever the websocket delivered. Called from the
   * socket (through the write queue) and at the top of every poll, so the
   * poll's own REST calls — which can block for the length of the tool call
   * — never stand between an ActionEvent and the store.
   */
  async #flushLiveEvents(tracker, runId, observedAt) {
    const result = this.#drainLiveEvents(tracker);
    if (!result.spans.length && !result.audit.length && !result.statsApplied) {
      return result;
    }
    const run = tracker.aggregator.run;
    run.updatedAt = observedAt;
    // A live cost report is judged right here: with back-to-back long
    // commands the poll only ever answers in the seconds between tool calls,
    // so a run could otherwise finish at many times its budget before the
    // poll's own enforcement saw a single dollar of it.
    if (result.statsApplied) {
      result.audit.push(...(await this.#enforceBudgets(run)));
    }
    await this.#persist(tracker, runId, result.spans, result.audit, observedAt);
    return result;
  }

  async #persist(tracker, runId, spans, audit, observedAt) {
    const run = tracker.aggregator.run;
    if (spans.length) await this.store.appendSpans(runId, spans);
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
  }

  async #syncConversation(conversation, observedAt) {
    const tracker = await this.#trackerFor(conversation, observedAt);
    // Behind any socket flush already in flight for this run, and ahead of
    // the next one: they share the aggregator and the store rows.
    return this.#enqueueWrite(tracker, () =>
      this.#pollConversation(tracker, conversation, observedAt),
    );
  }

  async #pollConversation(tracker, conversation, discoveredAt) {
    const runId = conversation.id;
    const { aggregator } = tracker;
    const run = aggregator.run;

    // A finished run stays on the search page for as long as the conversation
    // exists. Re-tailing and re-applying its stats every tick is what used to
    // inflate its counts and duplicate its audit rows, so once it has settled
    // there is nothing to do until the runtime reports a different status.
    if (
      tracker.settled &&
      normalizeRunStatus(conversation.execution_status) === run.status
    ) {
      return;
    }

    // Identity can change mid-run (a title is generated, a model is switched).
    run.task = conversation.title ?? run.task;
    run.workspaceId = deriveWorkspaceId(conversation);
    run.agentName = deriveAgentName(conversation);
    const model = deriveModel(conversation);
    if (model) run.model = model;
    run.updatedAt = normalizeTimestamp(conversation.updated_at) ?? discoveredAt;

    const spans = [];
    const audit = [];

    // Events first, status last. The events tailed in this tick happened
    // *before* the status we are about to fold in (the last tool call precedes
    // "finished"), so applying them in that order keeps the status-derived
    // phase ("completed", "waiting_approval") as the final word, lists
    // `task.completed` after the tool calls it followed, and lets its
    // "after N tool calls" count include them.
    //
    // The socket's events are persisted before the REST tail is even asked:
    // that request can hang for the length of the tool call, and a throw from
    // it must not take already-applied events down with it.
    const liveResult = await this.#flushLiveEvents(
      tracker,
      runId,
      discoveredAt,
    );

    const eventResult = await this.#tailEvents(tracker, runId);
    spans.push(...eventResult.spans);
    audit.push(...eventResult.audit);

    // The tail can block behind the same state lock for the length of the
    // tool call. Everything recorded from here on — the LLM spans' fallback
    // start, `run.paused` / `task.completed`, the audit rows — is dated by
    // when it is written, not by when this poll began, so a halt written
    // 40 s into a step does not sort above the policy change that caused it.
    const observedAt = this.now();

    // Persist the cursor with the run so a collector restart resumes rather
    // than replaying the whole conversation.
    run.lastEventTimestamp = tracker.cursor;
    run.lastEventIds = [...tracker.seenAtCursor];

    const statsResult = aggregator.applyStats(conversation.stats, observedAt);
    spans.push(...statsResult.spans);

    const statusResult = aggregator.applyStatus(
      conversation.execution_status,
      tracker.closingOut ? run.updatedAt : observedAt,
    );
    tracker.closingOut = false;
    audit.push(...statusResult.audit);

    const budgetAudit = await this.#enforceBudgets(run);
    audit.push(...budgetAudit);

    if (aggregator.run.status === "waiting_for_confirmation") {
      audit.push(...(await this.#raiseConfirmationApproval(aggregator)));
    }

    await this.#persist(tracker, runId, spans, audit, observedAt);

    // The aggregator (and its llmCursor / seen-event set) is kept for a
    // finished run rather than rebuilt from the store next tick — a rebuilt
    // one starts blank and re-counts. It settles once a tick after the
    // terminal status finds no trailing events; tick() prunes it when the
    // conversation leaves the search page.
    if (isTerminalStatus(run.status)) {
      tracker.settled =
        liveResult.spans.length === 0 &&
        liveResult.audit.length === 0 &&
        eventResult.spans.length === 0 &&
        eventResult.audit.length === 0 &&
        statusResult.audit.length === 0;
    } else {
      tracker.settled = false;
    }

    this.#syncLiveStream(tracker, runId);
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
            at: entry.at ?? normalizeTimestamp(event.timestamp),
          })),
        );

        // The cursor stays in the runtime's own (offset-less) form: it is sent
        // straight back as `timestamp__gte`, so it must match what the
        // agent-server compares against, not the normalized value we store.
        //
        // It only ever moves forward. A page is not strictly ordered — a
        // ConversationStateUpdateEvent stamped a millisecond before the
        // ActionEvent it follows is served after it — and letting the cursor
        // fall back to that older timestamp re-served the newer events on
        // the next poll, double-counting them.
        const advance = compareTimestamps(event.timestamp, tracker.cursor);
        if (advance > 0) {
          tracker.cursor = event.timestamp;
          tracker.seenAtCursor = new Set();
        }
        if (advance >= 0) tracker.seenAtCursor.add(event.id);
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
   *
   * Only a *running* run is judged. A paused one is already halted — by this
   * very enforcement a tick earlier, or by the operator — so it is spending
   * nothing, `/interrupt` would be a no-op on it, and the breach that stopped
   * it has already been raised. Judging it again is what used to make a
   * rejected budget approval impossible: the run stayed paused and over
   * budget, the rejected approval no longer counted as pending, and the same
   * breach was re-raised on the very next tick with a fresh audit pair. A
   * breach is raised again only once the run is running again — the operator
   * resumed it without raising the limit, or an approval raised the limit and
   * the run overspent that too.
   *
   * Rows and the approval are stamped with the time they are created here,
   * never with a timestamp the caller sampled earlier: a poll can spend a
   * whole step behind the runtime's state lock before it reaches this point.
   */
  async #enforceBudgets(run) {
    if (run.status !== "running") return [];

    const [policy, agentBudgetUsd, runs] = await Promise.all([
      this.store.getWorkspacePolicy(run.workspaceId),
      this.store.getAgentBudget(run.agentName),
      this.store.listRuns({ limit: 10000 }),
    ]);
    const observedAt = this.now();
    const since = monthStart(observedAt);

    // `runs` is a store read that raced this tick's own `#persist` (called
    // after this method returns), so on a store that hands back freshly
    // built rows from a real read (Supabase) it still carries this run's
    // *previous* tick's cost — undercounting workspace/agent spend by this
    // tick's delta and delaying a halt to the next poll. Swap in the
    // in-memory run, which `applyStats` already brought current this tick.
    const spendRuns = runs.some((r) => r.runId === run.runId)
      ? runs.map((r) => (r.runId === run.runId ? run : r))
      : [...runs, run];

    const workspaceSpend = computeSpend(spendRuns, {
      workspaceId: run.workspaceId,
      since,
    }).usedUsd;
    const agentSpend = computeSpend(spendRuns, {
      agentName: run.agentName,
      since,
    }).usedUsd;

    // A previously-approved "run" scope breach raises this run's own
    // ceiling only (see `applyBudgetApproval`'s doc comment) — read back
    // from the approval's stamped `raisedToUsd` rather than from policy,
    // which stays workspace-wide and untouched by the approval.
    const approvedForRun = await this.store.listApprovals({
      state: "approved",
      runId: run.runId,
    });
    const runBudgetOverrideUsd = approvedForRun
      .flatMap((approval) => approval.breaches ?? [])
      .filter((breach) => breach.scope === "run" && breach.raisedToUsd)
      .reduce((max, breach) => Math.max(max, breach.raisedToUsd), -Infinity);

    const { breaches, warnings } = evaluateBudgets({
      run,
      policy,
      agentBudgetUsd,
      workspaceSpend,
      agentSpend,
      runBudgetOverrideUsd:
        runBudgetOverrideUsd === -Infinity ? undefined : runBudgetOverrideUsd,
    });

    const audit = [];

    for (const warning of warnings) {
      const key = `${run.workspaceId}:${warning.thresholdPct}:${since}`;
      if (this.#alreadyWarned(key)) continue;
      audit.push({
        action: "budget.warning",
        summary: warning.message,
        at: observedAt,
        metadata: warning,
      });
    }

    if (!breaches.length) return audit;

    // Still needed for a run that stayed running because `/interrupt` failed:
    // one open approval per run, not one per tick.
    const pendingApprovals = await this.store.listApprovals({
      state: "pending",
    });
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
   *
   * The dedup key is the specific tool call being waited on, not just the
   * run: an operator can answer a confirmation out-of-band (the inline chat
   * buttons call `respond_to_confirmation` directly, bypassing this queue
   * entirely), which never flips that approval row out of "pending". Keying
   * only on `runId` meant that stale row silently swallowed every later,
   * genuinely-blocking confirmation for the rest of the run's life. Keying
   * the approval's own id on the tool call id instead makes it idempotent
   * across polls for the *same* wait (repeated ticks upsert the same row)
   * while still raising a fresh approval the moment the runtime moves on to
   * a different wait.
   */
  async #raiseConfirmationApproval(aggregator) {
    const run = aggregator.run;
    // The open tool span is exactly the action the runtime is waiting on.
    const [pending] = [...aggregator.openToolSpans.values()].slice(-1);
    const toolCallId = pending?.attributes?.[ToolAttributes.TOOL_ID] ?? null;
    const id = toolCallId
      ? `confirmation:${run.runId}:${toolCallId}`
      : `confirmation:${run.runId}`;

    const existing = await this.store.getApproval(id);
    if (existing) return [];

    const policy = await this.store.getWorkspacePolicy(run.workspaceId);
    // Stamped when the approval is created (see #enforceBudgets).
    const observedAt = this.now();

    await this.store.upsertApproval({
      id,
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
    let liveStreams = 0;
    for (const tracker of this.tracked.values()) {
      if (tracker.liveStream && !tracker.liveStream.closed) liveStreams += 1;
    }
    return {
      status: "ok",
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      trackedRuns: this.tracked.size,
      liveStreams,
      liveEventsReceived: this.liveEventsReceived,
      lastLiveEventAt: this.lastLiveEventAt,
    };
  }
}
