import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EnvironmentSetupScreen from "#/routes/environment-setup";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import { resetOAuthReceiptGuardForTests } from "#/lib/environment/oauth-receipt-guard";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

const state = vi.hoisted(() => ({
  session: null as { conversationId: string } | null,
  sessionLoading: true,
  posted: [] as string[],
  startSession: vi.fn(),
  createConversation: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: null,
}));

vi.mock("#/hooks/query/use-onboarding-session", () => ({
  useOnboardingSession: () => ({
    data: state.session,
    isLoading: state.sessionLoading,
  }),
  useStartOnboardingSession: () => ({ mutate: state.startSession }),
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: state.createConversation,
    isPending: false,
  }),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({ data: null }),
}));

vi.mock("#/hooks/query/use-environment-readiness", () => ({
  useEnvironmentReadiness: () => ({ byCapability: { llm: "ok" } }),
}));

vi.mock("#/lib/environment/invalidate-connection-caches", () => ({
  invalidateConnectionCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/services/onboarding-control", () => ({
  createConversationResultPoster: () => (message: string) => {
    state.posted.push(message);
  },
}));

// The studio shell mounts a live conversation socket; none of that is what
// this test is about.
vi.mock("#/contexts/websocket-provider-wrapper", () => ({
  WebSocketProviderWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("#/wrapper/event-handler", () => ({
  EventHandler: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("#/components/features/chat/chat-interface", () => ({
  ChatInterface: () => <div data-testid="chat-stub" />,
}));
vi.mock(
  "#/components/features/environment/studio/onboarding-workbench",
  () => ({
    OnboardingWorkbench: () => <div data-testid="workbench-stub" />,
  }),
);

function renderScreen(entry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <EnvironmentSetupScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.session = null;
  state.sessionLoading = true;
  state.posted = [];
  state.startSession.mockReset();
  state.createConversation.mockReset();
  vi.mocked(displayErrorToast).mockReset();
  resetOAuthReceiptGuardForTests();
  useOnboardingStudioStore.getState().reset();
});

describe("Environment setup OAuth receipt", () => {
  it("waits for the session lookup before consuming the receipt", async () => {
    // Returning from OAuth is a cold page load: the session query is still in
    // flight on the first render. Consuming the params there threw the receipt
    // away and left the agent waiting for a tool result forever.
    const { rerender } = renderScreen(
      "/environment/setup?connected=github&mirror=ok",
    );
    await screen.findByTestId("environment-setup-loading");
    expect(state.posted).toEqual([]);

    state.sessionLoading = false;
    state.session = { conversationId: "conv-1" };
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter
          initialEntries={["/environment/setup?connected=github&mirror=ok"]}
        >
          <EnvironmentSetupScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(state.posted).toHaveLength(1));
    expect(state.posted[0]).toContain(ONBOARDING_RESULT_PREFIX);
    expect(state.posted[0]).toContain('"status":"connected"');
    expect(state.posted[0]).toContain('"provider":"github"');
    expect(state.posted[0]).toContain('"legacy_mirror":"ok"');
  });

  it("posts a failed connection so the agent can recover from it", async () => {
    state.sessionLoading = false;
    state.session = { conversationId: "conv-1" };
    renderScreen("/environment/setup?error=access_denied");

    await waitFor(() => expect(state.posted).toHaveLength(1));
    expect(state.posted[0]).toContain('"status":"error"');
    expect(state.posted[0]).toContain('"reason":"access_denied"');
  });

  it("still posts a second, later connection for the same provider in a fresh page load", async () => {
    // The guard exists to survive StrictMode's double-invoked effect within
    // one page load, not to block a genuine second OAuth round trip. A real
    // second connect is always a fresh page load, which is what resetting
    // the guard here simulates.
    state.sessionLoading = false;
    state.session = { conversationId: "conv-1" };
    renderScreen("/environment/setup?connected=github&mirror=ok");
    await waitFor(() => expect(state.posted).toHaveLength(1));

    resetOAuthReceiptGuardForTests();
    state.posted = [];
    renderScreen("/environment/setup?connected=github&mirror=ok");

    await waitFor(() => expect(state.posted).toHaveLength(1));
    expect(state.posted[0]).toContain('"status":"connected"');
  });
});

describe("Environment setup studio workbench reset", () => {
  it("wipes the previous conversation's cards when a new session starts", async () => {
    state.sessionLoading = false;
    state.session = { conversationId: "conv-1" };
    const { rerender } = renderScreen("/environment/setup");

    await waitFor(() =>
      expect(useOnboardingStudioStore.getState().conversationId).toBe(
        "conv-1",
      ),
    );
    useOnboardingStudioStore.getState().pushCard({
      id: "discovery-1",
      kind: "discovery",
    });
    expect(useOnboardingStudioStore.getState().cards).toHaveLength(1);

    // A different conversation id resolving on this same mounted screen (a
    // new session after the first completed, or a different org) must not
    // leave the first session's singleton discovery/plan cards behind --
    // they would otherwise block a fresh discovery card from ever rendering.
    state.session = { conversationId: "conv-2" };
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/environment/setup"]}>
          <EnvironmentSetupScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(useOnboardingStudioStore.getState().conversationId).toBe(
        "conv-2",
      ),
    );
    expect(useOnboardingStudioStore.getState().cards).toHaveLength(0);
  });

  it("stays on the studio when the session query is invalidated out from under it (complete_setup race)", async () => {
    // `complete_setup` flips the session row to "completed", and the summary
    // card it triggers then invalidates the whole `["environment"]` prefix --
    // including this same session query -- as part of its own cache refresh.
    // That refetch resolves to `null` (no more "active" row) while the studio
    // is still mounted showing that very summary. It must not be torn down.
    state.sessionLoading = false;
    state.session = { conversationId: "conv-1" };
    const { rerender } = renderScreen("/environment/setup");

    await waitFor(() =>
      expect(useOnboardingStudioStore.getState().conversationId).toBe(
        "conv-1",
      ),
    );
    expect(screen.getByTestId("chat-stub")).toBeInTheDocument();

    state.session = null;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/environment/setup"]}>
          <EnvironmentSetupScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("chat-stub")).toBeInTheDocument();
    expect(
      screen.queryByTestId("environment-setup-start"),
    ).not.toBeInTheDocument();
    expect(useOnboardingStudioStore.getState().conversationId).toBe("conv-1");
  });
});

describe("Environment setup seed forwarding", () => {
  it("posts a `?seed=` fix-with-agent request into an already-active conversation", async () => {
    // The dock's Launch button always encodes the seed into this URL,
    // whether or not a session is already running. `handleStart` (which
    // otherwise consumes the seed as a new conversation's first message)
    // never fires once a session is already active, so without this the
    // seed text just vanished with no feedback.
    state.sessionLoading = false;
    state.session = { conversationId: "conv-1" };
    renderScreen("/environment/setup?seed=fix+my+thing");

    await waitFor(() => expect(state.posted).toEqual(["fix my thing"]));
  });

  it("leaves the seed alone while there is no active session yet, so `handleStart` can still consume it", async () => {
    state.sessionLoading = false;
    state.session = null;
    renderScreen("/environment/setup?seed=fix+my+thing");

    await screen.findByTestId("environment-setup-start");
    expect(state.posted).toEqual([]);
  });
});

describe("Environment setup session start failure", () => {
  it("surfaces an error instead of stranding the user when starting the session fails", async () => {
    // The conversation itself was created successfully -- only the session
    // row failed to save. Without an `onError` here, `conversationId` never
    // gets set and the screen silently sits on "start a new session" forever
    // with no indication that anything went wrong.
    state.sessionLoading = false;
    state.session = null;
    state.createConversation.mockImplementation((_input, options) => {
      options.onSuccess({ conversation_id: "conv-1" });
    });
    state.startSession.mockImplementation((_conversationId, options) => {
      options.onError(new Error("insert failed"));
    });

    renderScreen("/environment/setup");
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("environment-setup-begin"));

    await waitFor(() => expect(displayErrorToast).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("environment-setup-start")).toBeInTheDocument();
  });
});
