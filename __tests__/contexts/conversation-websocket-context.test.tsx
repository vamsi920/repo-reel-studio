import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUserMessageEvent } from "test-utils";
import { ConversationWebSocketProvider } from "#/contexts/conversation-websocket-context";
import { useEventStore } from "#/stores/use-event-store";
import useMetricsStore from "#/stores/metrics-store";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { useBrowserStore } from "#/stores/browser-store";
import { useCommandStore } from "#/stores/command-store";
import { useErrorMessageStore } from "#/stores/error-message-store";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import EventService from "#/api/event-service/event-service.api";
import {
  getStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import type { MessageEvent, OpenHandsEvent } from "#/types/agent-server/core";

type CapturedWebSocketOptions = {
  onMessage?: (event: { data: string }) => void;
  queryParams?: Record<string, string | boolean>;
  sessionApiKey?: string | null;
};

const wsCapture = vi.hoisted(() => ({
  mainOnMessage: null as null | ((event: { data: string }) => void),
  mainOptions: null as CapturedWebSocketOptions | null,
  calls: [] as Array<{
    url: string;
    options?: CapturedWebSocketOptions;
  }>,
}));

// Keep the units under test real (the provider, `useConversationHistory`, the
// event store). Only the network is stubbed: the WebSocket transport and the
// REST service the history query depends on.
vi.mock("#/hooks/use-websocket", () => ({
  useWebSocket: vi.fn((url: string, options?: CapturedWebSocketOptions) => {
    if (url) {
      wsCapture.calls.push({ url, options });
    }
    if (
      url &&
      options?.onMessage &&
      options.queryParams &&
      "resend_mode" in options.queryParams
    ) {
      wsCapture.mainOnMessage = options.onMessage;
      wsCapture.mainOptions = options;
    }
    return { socket: null, reconnect: vi.fn() };
  }),
}));
vi.mock("#/hooks/query/use-user-conversation", () => ({
  useUserConversation: vi.fn(),
}));

const AGENT_REPLY_ID = "evt-agent-reply";

// An agent reply that streamed in over the WebSocket *after* the initial REST
// history page — i.e. it lives only in the event store, never in the cached
// history page. This is the class of event the old code dropped on re-entry.
const makeAgentReply = (): MessageEvent => ({
  id: AGENT_REPLY_ID,
  timestamp: new Date(Date.now() + 1000).toISOString(),
  source: "agent",
  llm_message: { role: "assistant", content: [{ type: "text", text: "Hi!" }] },
  activated_microagents: [],
  extended_content: [],
});

const makeBashAction = (id: string, command: string) => ({
  id,
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command,
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: `call-${id}`,
  tool_call: {
    id: `call-${id}`,
    type: "function",
    function: {
      name: "execute_bash",
      arguments: JSON.stringify({ command }),
    },
  },
  llm_response_id: `resp-${id}`,
  security_risk: "UNKNOWN",
});

const makeBashObservation = (id: string, actionId: string, text: string) => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  action_id: actionId,
  tool_name: "execute_bash",
  tool_call_id: `call-${actionId}`,
  observation: {
    kind: "ExecuteBashObservation",
    content: [{ type: "text", text }],
    command: "run",
    exit_code: 0,
    error: false,
    timeout: false,
    metadata: {
      exit_code: 0,
      pid: 1,
      username: "u",
      hostname: "h",
      working_dir: "/",
      py_interpreter_path: null,
      prefix: "",
      suffix: "",
    },
  },
});

const makeBrowserNavigateAction = (id: string, url: string) => ({
  id,
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action: { kind: "BrowserNavigateAction", url, new_tab: false },
  tool_name: "browser_navigate",
  tool_call_id: `call-${id}`,
  tool_call: {
    id: `call-${id}`,
    type: "function",
    function: { name: "browser_navigate", arguments: JSON.stringify({ url }) },
  },
  llm_response_id: `resp-${id}`,
  security_risk: "UNKNOWN",
});

const makeBrowserObservation = (
  id: string,
  actionId: string,
  {
    error = null,
    screenshotData = null,
  }: { error?: string | null; screenshotData?: string | null } = {},
) => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  action_id: actionId,
  tool_name: "browser_navigate",
  tool_call_id: `call-${actionId}`,
  observation: {
    kind: "BrowserObservation",
    output: error ?? "Navigated to the page",
    error,
    screenshot_data: screenshotData,
  },
});

// The shape the agent-server actually emits for browser tools: a TextContent
// list plus `is_error`, no `output`/`error`, and no `screenshot_data` key at
// all unless the agent asked for a screenshot.
const makeWireBrowserObservation = (
  id: string,
  actionId: string,
  toolName: string,
  text: string,
  {
    isError = false,
    screenshotData,
  }: { isError?: boolean; screenshotData?: string } = {},
) => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  action_id: actionId,
  tool_name: toolName,
  tool_call_id: `call-${actionId}`,
  observation: {
    kind: "BrowserObservation",
    content: [{ type: "text", text }],
    is_error: isError,
    ...(screenshotData ? { screenshot_data: screenshotData } : {}),
  },
});

const eventIds = () => useEventStore.getState().events.map((event) => event.id);

describe("ConversationWebSocketProvider — conversation-scoped event store", () => {
  let queryClient: QueryClient;

  const renderProvider = (conversationId: string) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId={conversationId}
          conversationUrl={null}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

  beforeEach(() => {
    wsCapture.mainOnMessage = null;
    wsCapture.mainOptions = null;
    wsCapture.calls.length = 0;
    window.localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    useEventStore.setState({
      events: [],
      eventIds: new Set(),
      uiEvents: [],
      loadedConversationId: null,
    });
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
    useBrowserStore.getState().reset();
    useMetricsStore.getState().resetMetrics();
    useCommandStore.setState({ commands: [] });
    useErrorMessageStore.getState().removeErrorMessage();

    vi.mocked(useUserConversation).mockReturnValue({
      data: { conversation_url: "http://localhost/api", session_api_key: null },
    } as ReturnType<typeof useUserConversation>);

    // The cached REST history page ends at the user's message — a fresh page
    // per conversation so we can detect cross-conversation leakage.
    vi.spyOn(EventService, "searchEvents").mockImplementation(
      async (conversationId: string) => ({
        items: [createUserMessageEvent(`user-msg-${conversationId}`)],
        next_page_id: null,
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  // A successful model switch the agent performed on its own (via the
  // SwitchLLM tool), delivered over the main WebSocket.
  const makeAgentSwitchObservation = (profileName: string) => ({
    id: "evt-switch-1",
    timestamp: new Date().toISOString(),
    source: "environment",
    action_id: "action-switch-1",
    tool_name: "switch_llm",
    tool_call_id: "call-switch-1",
    observation: {
      kind: "SwitchLLMObservation",
      content: [{ type: "text", text: `Switched to ${profileName}` }],
      is_error: false,
      profile_name: profileName,
      reason: null,
      active_model: null,
    },
  });

  it("stamps active_profile on a successful agent-triggered model switch so it survives reload", async () => {
    // Arrange: open a conversation with a real ws url so the main socket's
    // onMessage (handleMainMessage) is wired and captured.
    render(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-switch"
          conversationUrl="http://localhost/api"
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(wsCapture.mainOnMessage).not.toBeNull());

    // Act: the agent switches to "fast-opus" via the SwitchLLM tool.
    act(() => {
      wsCapture.mainOnMessage!({
        data: JSON.stringify(makeAgentSwitchObservation("fast-opus")),
      });
    });

    // Assert: the profile identity is persisted to stored metadata — the same
    // field the chat-header switcher reads after a reload (#1082). Without the
    // stamp this stays null and the header falls back to ambiguous matching.
    expect(getStoredConversationMetadata("conv-switch")?.active_profile).toBe(
      "fast-opus",
    );
  });

  it("keeps the session key out of WebSocket query parameters", async () => {
    const sessionApiKey = `sk-oh-${"c".repeat(64)}`;

    render(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-auth"
          conversationUrl="http://localhost/api"
          sessionApiKey={sessionApiKey}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(wsCapture.mainOptions).not.toBeNull());

    expect(wsCapture.mainOptions?.sessionApiKey).toBe(sessionApiKey);
    expect(wsCapture.mainOptions?.queryParams).not.toHaveProperty(
      "session_api_key",
    );
  });

  it("uses the planning sub-conversation session key", async () => {
    const mainSessionApiKey = `sk-oh-main-${"m".repeat(48)}`;
    const planningSessionApiKey = `sk-oh-plan-${"p".repeat(48)}`;
    const planningConversation: AppConversation = {
      id: "planning-auth",
      created_by_user_id: null,
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      title: "Planner",
      trigger: null,
      pr_number: [],
      llm_model: null,
      metrics: null,
      created_at: "2026-07-28T00:00:00Z",
      updated_at: "2026-07-28T00:00:00Z",
      execution_status: null,
      conversation_url:
        "http://planner.example/api/conversations/planning-auth",
      session_api_key: planningSessionApiKey,
      sandbox_id: null,
      sub_conversation_ids: [],
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-auth"
          conversationUrl="http://main.example/api/conversations/conv-auth"
          sessionApiKey={mainSessionApiKey}
          subConversationIds={[planningConversation.id]}
          subConversations={[planningConversation]}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        wsCapture.calls.some(({ url }) =>
          url.endsWith("/sockets/events/planning-auth"),
        ),
      ).toBe(true),
    );

    const planningCall = wsCapture.calls.find(({ url }) =>
      url.endsWith("/sockets/events/planning-auth"),
    );

    expect(planningCall?.url).toBe(
      "ws://planner.example/sockets/events/planning-auth",
    );
    expect(planningCall?.options?.sessionApiKey).toBe(planningSessionApiKey);
    expect(planningCall?.options?.queryParams).toEqual({ resend_all: true });
    expect(planningCall?.options?.queryParams).not.toHaveProperty(
      "session_api_key",
    );
  });

  it("preserves the conversation's attached plugins across an agent-triggered model switch", async () => {
    // Arrange: the conversation's metadata already carries an attached plugin.
    setStoredConversationMetadata("conv-switch", {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      plugins: [
        { source: "github:acme/city-weather", ref: null, repo_path: null },
      ],
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-switch"
          conversationUrl="http://localhost/api"
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(wsCapture.mainOnMessage).not.toBeNull());

    // Act: the agent switches model via the SwitchLLM tool.
    act(() => {
      wsCapture.mainOnMessage!({
        data: JSON.stringify(makeAgentSwitchObservation("fast-opus")),
      });
    });

    // Assert: the plugins snapshot survives the full-object metadata replace.
    expect(getStoredConversationMetadata("conv-switch")?.plugins).toEqual([
      { source: "github:acme/city-weather", ref: null, repo_path: null },
    ]);
  });

  // On reconnect the backlog is replayed; non-idempotent side-effects must not
  // fire again for events already processed (#1656).
  describe("reconnect replay does not re-run non-idempotent side-effects", () => {
    const makeConversationError = (id: string, detail: string) => ({
      id,
      timestamp: new Date().toISOString(),
      source: "environment",
      kind: "ConversationErrorEvent",
      detail,
      code: "SomeError",
    });

    const renderCaptured = async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ConversationWebSocketProvider
            conversationId="conv-reconnect"
            conversationUrl="http://localhost/api"
          >
            <div />
          </ConversationWebSocketProvider>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(wsCapture.mainOnMessage).not.toBeNull());
    };

    const deliver = (event: unknown) =>
      act(() => {
        wsCapture.mainOnMessage!({ data: JSON.stringify(event) });
      });

    it("does not re-append terminal input/output for replayed bash events", async () => {
      await renderCaptured();

      const action = makeBashAction("bash-action-1", "echo hi");
      const observation = makeBashObservation(
        "bash-obs-1",
        "bash-action-1",
        "hi\n",
      );

      // First delivery, then a reconnect replay of the same two events.
      deliver(action);
      deliver(observation);
      deliver(action);
      deliver(observation);

      expect(useCommandStore.getState().commands).toEqual([
        { content: "echo hi", type: "input" },
        { content: "hi\n", type: "output" },
      ]);
    });

    it("does not re-raise a dismissed error banner when the error event is replayed", async () => {
      await renderCaptured();

      const errorEvent = makeConversationError("conv-error-1", "Boom");

      // Show the banner, dismiss it, then replay the error on reconnect.
      deliver(errorEvent);
      expect(useErrorMessageStore.getState().errorMessage).toBe("Boom");
      act(() => useErrorMessageStore.getState().removeErrorMessage());
      expect(useErrorMessageStore.getState().errorMessage).toBeNull();

      // It must stay dismissed.
      deliver(errorEvent);
      expect(useErrorMessageStore.getState().errorMessage).toBeNull();
    });
  });

  it("clears the previous conversation's events when switching conversations", async () => {
    // Arrange + Act: open conversation A.
    const { rerender } = renderProvider("conv-a");
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-a"]));

    // Act: switch to conversation B.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-b"
          conversationUrl={null}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

    // Assert: B's history replaced A's — A did not leak into B.
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-b"]));
  });

  it("resets browser-panel state when switching conversations", async () => {
    const { rerender } = renderProvider("conv-a");
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-a"]));

    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc: "data:image/png;base64,abc123",
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-b"
          conversationUrl={null}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(useBrowserStore.getState().screenshotSrc).toBe(""),
    );
    expect(useBrowserStore.getState().url).toBe("");
  });

  describe("BrowserNavigateAction / BrowserObservation pairing", () => {
    const renderBrowserCaptured = async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ConversationWebSocketProvider
            conversationId="conv-browser"
            conversationUrl="http://localhost/api"
          >
            <div />
          </ConversationWebSocketProvider>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(wsCapture.mainOnMessage).not.toBeNull());
    };

    const deliverBrowserEvent = (event: unknown) =>
      act(() => {
        wsCapture.mainOnMessage!({ data: JSON.stringify(event) });
      });

    // The dispatched action only records what the agent asked for. Adopting
    // it immediately (instead of waiting for the observation) is exactly how
    // the panel used to show a target URL the browser never actually reached.
    it("does not update the URL bar until the browser observation confirms it", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-1", "https://example.com"),
      );
      expect(useBrowserStore.getState().url).toBe("");

      deliverBrowserEvent(
        makeBrowserObservation("obs-1", "nav-1", {
          screenshotData: "abc123",
        }),
      );
      expect(useBrowserStore.getState().url).toBe("https://example.com");
      expect(useBrowserStore.getState().screenshotSrc).toBe(
        "data:image/png;base64,abc123",
      );
    });

    // Matches the reported bug: the browser tool can claim a navigation
    // succeeded while the observation says otherwise. The URL bar and
    // screenshot must not adopt the claimed destination in that case.
    it("does not adopt the requested URL when the browser observation reports an error", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-2", "https://example.com/blocked"),
      );
      deliverBrowserEvent(
        makeBrowserObservation("obs-2", "nav-2", {
          error: "Cannot navigate - browser not connected",
        }),
      );

      expect(useBrowserStore.getState().url).toBe("");
      expect(useBrowserStore.getState().screenshotSrc).toBe("");
    });

    // The exact reported failure mode: the browser tool's observation comes
    // back with neither a screenshot nor an error — it silently no-op'd
    // instead of actually navigating. Requiring a real screenshot (not just
    // "no error") to confirm the URL is what catches this case too.
    it("does not adopt the requested URL when the observation has no screenshot and no error", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-3", "http://localhost:8080"),
      );
      deliverBrowserEvent(makeBrowserObservation("obs-3", "nav-3"));

      expect(useBrowserStore.getState().url).toBe("");
      expect(useBrowserStore.getState().screenshotSrc).toBe("");
    });

    // Reported bug: a navigation genuinely succeeds (a real screenshot comes
    // back) but the address bar stays on the placeholder forever. Root cause:
    // the REST history page can independently deliver a
    // BrowserNavigateAction/BrowserObservation pair (e.g. a background
    // refetch that resolves ahead of the live WebSocket message for the same
    // events) *before* `handleMainMessage` ever sees them live — and once an
    // event is already known to the store, the live handler's duplicate-event
    // guard skips the pairing side effects entirely. Without replaying the
    // pair from REST history too, the URL never commits even though the
    // observation genuinely confirmed the navigation.
    it("commits the confirmed URL when the navigate action and its observation arrive together via REST-preloaded history", async () => {
      // `searchEvents` mimics the real server's TIMESTAMP_DESC order (newest
      // first) — the hook reverses it back to chronological order.
      vi.spyOn(EventService, "searchEvents").mockImplementation(async () => ({
        items: [
          makeBrowserObservation("obs-hist-1", "nav-hist-1", {
            screenshotData: "abc123",
          }),
          makeBrowserNavigateAction("nav-hist-1", "https://example.com"),
        ] as unknown as OpenHandsEvent[],
        next_page_id: null,
      }));

      await renderBrowserCaptured();

      await waitFor(() =>
        expect(useBrowserStore.getState().url).toBe("https://example.com"),
      );
      expect(useBrowserStore.getState().screenshotSrc).toBe(
        "data:image/png;base64,abc123",
      );
    });

    // Same bug, the more common shape: the navigate action was already
    // captured by a REST history refetch, but its confirming observation is
    // still in flight and arrives live. Without replaying the action from
    // REST history, the live observation would have nothing pending to
    // confirm and the URL would never commit.
    it("confirms a pending navigation recorded from REST-preloaded history when the observation arrives live", async () => {
      vi.spyOn(EventService, "searchEvents").mockImplementation(async () => ({
        items: [
          makeBrowserNavigateAction("nav-hist-2", "https://example.com"),
        ] as unknown as OpenHandsEvent[],
        next_page_id: null,
      }));

      await renderBrowserCaptured();
      expect(useBrowserStore.getState().url).toBe("");

      deliverBrowserEvent(
        makeBrowserObservation("obs-hist-2", "nav-hist-2", {
          screenshotData: "def456",
        }),
      );

      expect(useBrowserStore.getState().url).toBe("https://example.com");
      expect(useBrowserStore.getState().screenshotSrc).toBe(
        "data:image/png;base64,def456",
      );
    });

    // Reported bug: on the production tool the navigate observation is just
    // "Navigated to: <url>" with no screenshot_data key at all, and the agent
    // then calls browser_get_state (include_screenshot:false) whose JSON
    // reports the browser's real current URL. Only the screenshot gate above
    // existed, so the URL was never committed and the Browser tab stayed on
    // "No page loaded yet" after a genuine navigation.
    it("commits the URL a browser_get_state observation reports even with no screenshot", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-4", "http://localhost:8765/index.html"),
      );
      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-4",
          "nav-4",
          "browser_navigate",
          "Navigated to: http://localhost:8765/index.html",
        ),
      );
      // The navigate's own reply is still not trusted on its own.
      expect(useBrowserStore.getState().url).toBe("");

      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-5",
          "state-1",
          "browser_get_state",
          JSON.stringify({
            url: "http://localhost:8765/index.html",
            title: "localhost:8765/index.html",
            tabs: [],
            interactive_elements: [],
          }),
        ),
      );

      expect(useBrowserStore.getState().url).toBe(
        "http://localhost:8765/index.html",
      );
      expect(useBrowserStore.getState().screenshotSrc).toBe("");
    });

    it("commits the URL a browser_get_content observation reports", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-6",
          "content-1",
          "browser_get_content",
          "<url>\nhttp://localhost:8765/index.html\n</url>\n<content>\n<webpage_content>\n# QA site OK\n</webpage_content>\n</content>",
        ),
      );

      expect(useBrowserStore.getState().url).toBe(
        "http://localhost:8765/index.html",
      );
    });

    it("stores the screenshot when browser_get_state was asked for one", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-7",
          "state-2",
          "browser_get_state",
          JSON.stringify({ url: "https://example.com", title: "Example" }),
          { screenshotData: "ghi789" },
        ),
      );

      expect(useBrowserStore.getState().url).toBe("https://example.com");
      expect(useBrowserStore.getState().screenshotSrc).toBe(
        "data:image/png;base64,ghi789",
      );
    });

    // Reported bug: after a.html was navigated to *with* a screenshot, the
    // agent navigated to b.html and only called browser_get_state
    // (include_screenshot: false). The URL bar moved to b.html but the
    // a.html screenshot stayed, so the user saw "PAGE A" labelled b.html.
    it("drops the previous page's screenshot when get_state reports a new URL without one", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-a", "http://127.0.0.1:8765/a.html"),
      );
      deliverBrowserEvent(
        makeBrowserObservation("obs-a", "nav-a", { screenshotData: "pageA" }),
      );
      expect(useBrowserStore.getState().url).toBe(
        "http://127.0.0.1:8765/a.html",
      );
      expect(useBrowserStore.getState().screenshotSrc).toBe(
        "data:image/png;base64,pageA",
      );

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-b", "http://127.0.0.1:8765/b.html"),
      );
      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-b",
          "nav-b",
          "browser_navigate",
          "Navigated to: http://127.0.0.1:8765/b.html",
        ),
      );
      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-b-state",
          "state-b",
          "browser_get_state",
          JSON.stringify({ url: "http://127.0.0.1:8765/b.html", title: "B" }),
        ),
      );

      expect(useBrowserStore.getState().url).toBe(
        "http://127.0.0.1:8765/b.html",
      );
      expect(useBrowserStore.getState().screenshotSrc).toBe("");
    });

    // A click/scroll/get_state on the *same* page reports the same URL; the
    // screenshot taken on that page is still valid and must stay.
    it("keeps the screenshot when get_state reports the same URL without one", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-same", "https://example.com"),
      );
      deliverBrowserEvent(
        makeBrowserObservation("obs-same", "nav-same", {
          screenshotData: "same",
        }),
      );
      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-same-state",
          "state-same",
          "browser_get_state",
          JSON.stringify({ url: "https://example.com", title: "Example" }),
        ),
      );

      expect(useBrowserStore.getState().url).toBe("https://example.com");
      expect(useBrowserStore.getState().screenshotSrc).toBe(
        "data:image/png;base64,same",
      );
    });

    it("replaces the screenshot when get_state reports a new URL with a new one", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeBrowserNavigateAction("nav-c", "https://example.com/c"),
      );
      deliverBrowserEvent(
        makeBrowserObservation("obs-c", "nav-c", { screenshotData: "pageC" }),
      );
      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-d-state",
          "state-d",
          "browser_get_state",
          JSON.stringify({ url: "https://example.com/d", title: "D" }),
          { screenshotData: "pageD" },
        ),
      );

      expect(useBrowserStore.getState().url).toBe("https://example.com/d");
      expect(useBrowserStore.getState().screenshotSrc).toBe(
        "data:image/png;base64,pageD",
      );
    });

    it("ignores a failed browser_get_state observation", async () => {
      await renderBrowserCaptured();

      deliverBrowserEvent(
        makeWireBrowserObservation(
          "obs-8",
          "state-3",
          "browser_get_state",
          JSON.stringify({ url: "https://example.com" }),
          { isError: true },
        ),
      );

      expect(useBrowserStore.getState().url).toBe("");
    });
  });

  it("resets the metrics store when switching conversations", async () => {
    const { rerender } = renderProvider("conv-a");
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-a"]));

    useMetricsStore.setState({
      cost: 1.5,
      max_budget_per_task: 5,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        cache_read_tokens: 1,
        cache_write_tokens: 2,
        context_window: 128_000,
        per_turn_token: 500,
      },
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-b"
          conversationUrl={null}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(useMetricsStore.getState().usage).toBeNull());
    expect(useMetricsStore.getState().cost).toBeNull();
    expect(useMetricsStore.getState().max_budget_per_task).toBeNull();
  });

  it("keeps events that arrived after history when re-entering the same conversation", async () => {
    // Arrange: open conversation A, then receive an agent reply over the socket
    // that is not part of the cached REST history page.
    const { unmount } = renderProvider("conv-a");
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-a"]));
    act(() => {
      useEventStore.getState().addEvent(makeAgentReply());
    });

    // Act: leave (e.g. to Settings) and return to the same conversation.
    unmount();
    renderProvider("conv-a");

    // Assert: both the user message and the streamed reply survive re-entry.
    await waitFor(() =>
      expect(eventIds()).toEqual(["user-msg-conv-a", AGENT_REPLY_ID]),
    );
    // ...and the re-seed deduped against the existing user message rather than
    // appending a second copy — exactly two events, no double-insertion.
    expect(eventIds()).toHaveLength(2);
  });

  it("consumes the optimistic pending bubble when the echoed user message arrives via REST preload", async () => {
    // Arrange: a cloud start-task conversation left a "Sending…" bubble whose
    // content matches the first message the server has already persisted. With
    // the WebSocket stubbed, the only path that delivers the echo is the REST
    // history preload — the path that previously left this bubble orphaned.
    useOptimisticUserMessageStore.setState({
      pendingMessages: [
        {
          id: "pending-1",
          conversationId: "conv-a",
          text: "User message",
          content: "User message",
          status: "sending",
          imageUrls: [],
          fileUrls: [],
          timestamp: new Date().toISOString(),
        },
      ],
    });

    // Act: open the conversation; preload returns the echoed user message.
    renderProvider("conv-a");

    // Assert: the preloaded echo cleared the bubble, so it isn't shown twice.
    await waitFor(() =>
      expect(useOptimisticUserMessageStore.getState().pendingMessages).toEqual(
        [],
      ),
    );
  });
});

describe("ConversationWebSocketProvider — terminal seeded from history", () => {
  let queryClient: QueryClient;

  const renderProvider = (conversationId: string) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId={conversationId}
          conversationUrl={null}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

  const commands = () => useCommandStore.getState().commands;

  beforeEach(() => {
    wsCapture.mainOnMessage = null;
    wsCapture.mainOptions = null;
    wsCapture.calls.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useEventStore.getState().clearEvents();
    useCommandStore.setState({ commands: [] });

    vi.mocked(useUserConversation).mockReturnValue({
      data: { conversation_url: "http://localhost/api", session_api_key: null },
    } as ReturnType<typeof useUserConversation>);

    // Only conversation A ran a command. The service returns newest-first;
    // the history hook reverses it into chronological order.
    vi.spyOn(EventService, "searchEvents").mockImplementation(
      async (conversationId: string) => ({
        items: (conversationId === "conv-a"
          ? [
              makeBashObservation("bash-obs-1", "bash-1", "a.txt\n"),
              makeBashAction("bash-1", "ls"),
              createUserMessageEvent("user-msg-conv-a"),
            ]
          : [
              createUserMessageEvent(`user-msg-${conversationId}`),
            ]) as unknown as OpenHandsEvent[],
        next_page_id: null,
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("seeds the terminal with the bash commands from the preloaded history page", async () => {
    renderProvider("conv-a");

    await waitFor(() =>
      expect(commands()).toEqual([
        { content: "ls", type: "input" },
        { content: "a.txt\n", type: "output" },
      ]),
    );
  });

  it("does not append the same history twice when re-entering the conversation", async () => {
    const { unmount } = renderProvider("conv-a");
    await waitFor(() => expect(commands()).toHaveLength(2));

    // Leave (e.g. to Settings) and come back: the page is refetched and the
    // preload effect runs again with the same events.
    unmount();
    renderProvider("conv-a");
    await waitFor(() => expect(eventIds()).toHaveLength(3));

    expect(commands()).toEqual([
      { content: "ls", type: "input" },
      { content: "a.txt\n", type: "output" },
    ]);
  });

  it("clears the previous conversation's terminal when switching conversations", async () => {
    const { rerender } = renderProvider("conv-a");
    await waitFor(() => expect(commands()).toHaveLength(2));

    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId="conv-b"
          conversationUrl={null}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-b"]));
    expect(commands()).toEqual([]);
  });
});
