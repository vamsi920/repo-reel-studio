/**
 * The collector's read/control channel to the OpenHands agent-server.
 *
 * Deliberately a thin `fetch` wrapper rather than `@openhands/typescript-client`:
 * this file runs in the launcher's plain-Node process, which does not go through
 * the app's bundler, and it needs only five endpoints. The endpoint paths and
 * response shapes mirror `client/conversation-client.js` in that package, which
 * is the contract of record.
 *
 * The agent-server is NOT modified by any of this. Reads are `GET`s (plus a
 * read-only subscription to the same events websocket the chat UI opens); the
 * only writes are the same pause/interrupt/run control calls the app's own
 * chat UI already makes.
 */

/** Sent first thing on the events socket, exactly as `src/utils/websocket-auth.ts` does. */
const WEBSOCKET_AUTH_TYPE = "auth";

export class AgentServerClient {
  constructor({ baseUrl, sessionApiKey, timeoutMs = 30000 }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.sessionApiKey = sessionApiKey;
    this.timeoutMs = timeoutMs;
  }

  async #request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(this.sessionApiKey
            ? { "X-Session-API-Key": this.sessionApiKey }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const error = new Error(
          `agent-server ${method} ${path} failed: ${response.status} ${text}`,
        );
        error.status = response.status;
        throw error;
      }
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One page of conversations, newest-updated first. `ConversationInfo`
   * carries `stats` (the full `usage_to_metrics`), `execution_status`,
   * `workspace` and `agent`, so a single page gives the collector everything
   * it needs for the run records — no per-conversation follow-up call.
   */
  async searchConversations({ limit = 50, pageId } = {}) {
    const params = new URLSearchParams({
      limit: String(limit),
      sort_order: "UPDATED_AT_DESC",
    });
    if (pageId) params.set("page_id", pageId);
    return this.#request(`/api/conversations/search?${params.toString()}`);
  }

  async getConversation(conversationId) {
    return this.#request(`/api/conversations/${conversationId}`);
  }

  /**
   * Oldest-first page of events, for cursor-based tailing.
   *
   * `timestampGte` is the durable cursor: page ids are opaque and are exhausted
   * once a page runs out, whereas "everything at or after the last event I
   * saw" survives a collector restart.
   */
  async searchEvents(
    conversationId,
    { limit = 100, pageId, timestampGte } = {},
  ) {
    const params = new URLSearchParams({
      limit: String(limit),
      sort_order: "TIMESTAMP",
    });
    if (pageId) params.set("page_id", pageId);
    if (timestampGte) params.set("timestamp__gte", timestampGte);
    return this.#request(
      `/api/conversations/${conversationId}/events/search?${params.toString()}`,
    );
  }

  /**
   * Whether this process can open the events websocket at all. Node 22+ ships
   * a global `WebSocket`; on anything older the collector keeps working on the
   * REST tail alone.
   */
  static get supportsEventStream() {
    return typeof globalThis.WebSocket === "function";
  }

  /**
   * Subscribe to a conversation's live event stream.
   *
   * This is the same `/sockets/events/{id}` socket the chat UI uses
   * (`src/utils/websocket-url.ts` + `src/hooks/use-websocket.ts`), and it is
   * the only channel that delivers an `ActionEvent` while the agent-server is
   * still blocked inside that tool call — `events/search` does not serve the
   * call (nor the LLM completion before it) until the observation lands, so
   * a REST-only collector shows a two-minute command as "0 tool calls" for
   * the whole two minutes.
   *
   * `since` mirrors the UI's `resend_mode=since` handshake: the runtime
   * replays everything strictly after that timestamp, so a reconnect from the
   * collector's REST cursor never misses an event. Overlap with the REST tail
   * is expected and is deduped by event id in `RunAggregator`.
   *
   * Returns a handle, or `null` when no WebSocket implementation is available.
   * The handle does not reconnect on its own: the collector re-opens it on a
   * later tick while the run is still active, which is a natural backoff.
   *
   * `onOpen` fires once the handshake completed (and the auth frame was sent);
   * `onClose` fires with the peer's close code and reason — a 4001 there is
   * the runtime rejecting the session key, which is otherwise silent.
   */
  openEventStream(
    conversationId,
    { since, onEvent, onError, onOpen, onClose } = {},
  ) {
    if (!AgentServerClient.supportsEventStream) return null;

    const url = new URL(this.baseUrl);
    const scheme = url.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams(
      since
        ? { resend_mode: "since", after_timestamp: since }
        : { resend_mode: "all" },
    );
    const socketUrl = `${scheme}//${url.host}${url.pathname.replace(/\/$/, "")}/sockets/events/${conversationId}?${params.toString()}`;

    const handle = { closed: false, close: () => {} };
    let socket;
    try {
      socket = new globalThis.WebSocket(socketUrl);
    } catch (error) {
      onError?.(error);
      return null;
    }

    handle.close = () => {
      if (handle.closed) return;
      handle.closed = true;
      try {
        socket.close();
      } catch {
        // Already closed by the peer; nothing to release.
      }
    };

    socket.addEventListener("open", () => {
      if (this.sessionApiKey) {
        socket.send(
          JSON.stringify({
            type: WEBSOCKET_AUTH_TYPE,
            session_api_key: this.sessionApiKey,
          }),
        );
      }
      onOpen?.();
    });
    socket.addEventListener("message", (message) => {
      let event;
      try {
        event =
          typeof message.data === "string"
            ? JSON.parse(message.data)
            : JSON.parse(String(message.data));
      } catch (error) {
        onError?.(new Error(`events socket sent non-JSON: ${error.message}`));
        return;
      }
      onEvent?.(event);
    });
    socket.addEventListener("error", () => {
      onError?.(new Error("events socket errored"));
    });
    socket.addEventListener("close", (event) => {
      handle.closed = true;
      onClose?.({ code: event?.code ?? null, reason: event?.reason ?? "" });
    });

    return handle;
  }

  /**
   * Halt a run. `/interrupt` (not `/pause`) is what actually stops in-flight
   * work on a local agent-server — the same choice the app's own
   * `pauseConversation` makes in `src/hooks/mutation/conversation-mutation-utils.ts`.
   */
  async interruptConversation(conversationId) {
    return this.#request(`/api/conversations/${conversationId}/interrupt`, {
      method: "POST",
      body: {},
    });
  }

  async pauseConversation(conversationId) {
    return this.#request(`/api/conversations/${conversationId}/pause`, {
      method: "POST",
      body: {},
    });
  }

  async runConversation(conversationId) {
    return this.#request(`/api/conversations/${conversationId}/run`, {
      method: "POST",
      body: {},
    });
  }

  async respondToConfirmation(conversationId, { accept, reason }) {
    return this.#request(
      `/api/conversations/${conversationId}/events/respond_to_confirmation`,
      { method: "POST", body: { accept, ...(reason ? { reason } : {}) } },
    );
  }
}
