import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentServerClient } from "../../scripts/agentops/agent-server-client.mjs";

/**
 * A stand-in for Node's global `WebSocket` (undici's, from Node 22 on):
 * records the URL and outgoing frames, and lets a test play the runtime's
 * side — open, push an event frame, hang up with a close code.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;

  sent: string[] = [];

  closed = false;

  private listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(frame: string) {
    this.sent.push(frame);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe("AgentServerClient.openEventStream", () => {
  afterEach(() => {
    FakeWebSocket.instances = [];
    vi.unstubAllGlobals();
  });

  function makeClient() {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    return new AgentServerClient({
      baseUrl: "https://neo-agent-server.fly.dev/",
      sessionApiKey: "secret-key",
    });
  }

  it("dials the runtime's events socket with the UI's auth frame and replays from the cursor", () => {
    const client = makeClient();
    const onOpen = vi.fn();

    const handle = client.openEventStream("run-1", {
      since: "2026-09-14T15:08:34.123456",
      onOpen,
    });
    expect(handle).not.toBeNull();

    const socket = FakeWebSocket.instances[0];
    const url = new URL(socket.url);
    expect(url.protocol).toBe("wss:");
    expect(url.pathname).toBe("/sockets/events/run-1");
    expect(url.searchParams.get("resend_mode")).toBe("since");
    expect(url.searchParams.get("after_timestamp")).toBe(
      "2026-09-14T15:08:34.123456",
    );
    // The key travels in the first frame, never in the URL (proxy logs).
    expect(url.searchParams.has("session_api_key")).toBe(false);

    socket.emit("open");
    expect(socket.sent).toEqual([
      JSON.stringify({ type: "auth", session_api_key: "secret-key" }),
    ]);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("replays everything for a run with no cursor", () => {
    const client = makeClient();
    client.openEventStream("run-1", { since: null });
    const url = new URL(FakeWebSocket.instances[0].url);
    expect(url.searchParams.get("resend_mode")).toBe("all");
    expect(url.searchParams.has("after_timestamp")).toBe(false);
  });

  it("hands each frame over as the runtime's event object, id included", () => {
    const client = makeClient();
    const onEvent = vi.fn();
    const onError = vi.fn();
    client.openEventStream("run-1", { onEvent, onError });
    const socket = FakeWebSocket.instances[0];

    // Exactly what `sockets.py` sends: `event.model_dump(mode="json")`.
    const frame = {
      id: "evt-action",
      kind: "ActionEvent",
      timestamp: "2026-09-14T15:09:05.001000",
      source: "agent",
      tool_name: "terminal",
      tool_call_id: "call-2",
      action: { kind: "TerminalAction", command: "sleep 150; echo done" },
    };
    socket.emit("message", { data: JSON.stringify(frame) });
    expect(onEvent).toHaveBeenCalledWith(frame);

    socket.emit("message", { data: "not json" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/non-JSON/);
  });

  it("reports the peer's close code so an auth rejection is not silent", () => {
    const client = makeClient();
    const onClose = vi.fn();
    const handle = client.openEventStream("run-1", { onClose });
    const socket = FakeWebSocket.instances[0];

    socket.emit("close", { code: 4001, reason: "Authentication failed" });
    expect(handle?.closed).toBe(true);
    expect(onClose).toHaveBeenCalledWith({
      code: 4001,
      reason: "Authentication failed",
    });

    // Closing an already-closed handle is a no-op, not a second close frame.
    handle?.close();
    expect(socket.closed).toBe(false);
  });

  it("returns null without a WebSocket implementation", () => {
    vi.stubGlobal("WebSocket", undefined);
    const client = new AgentServerClient({
      baseUrl: "http://127.0.0.1:18000",
      sessionApiKey: null,
    });
    expect(AgentServerClient.supportsEventStream).toBe(false);
    expect(client.openEventStream("run-1")).toBeNull();
  });
});
