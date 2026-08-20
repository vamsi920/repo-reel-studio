/**
 * The collector's read/control channel to the OpenHands agent-server.
 *
 * Deliberately a thin `fetch` wrapper rather than `@openhands/typescript-client`:
 * this file runs in the launcher's plain-Node process, which does not go through
 * the app's bundler, and it needs only five endpoints. The endpoint paths and
 * response shapes mirror `client/conversation-client.js` in that package, which
 * is the contract of record.
 *
 * The agent-server is NOT modified by any of this. Reads are `GET`s; the only
 * writes are the same pause/interrupt/run control calls the app's own chat UI
 * already makes.
 */

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
