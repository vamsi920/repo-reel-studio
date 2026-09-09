import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EnvironmentSetupScreen from "#/routes/environment-setup";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";

const state = vi.hoisted(() => ({
  session: null as { conversationId: string } | null,
  sessionLoading: true,
  posted: [] as string[],
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
  useStartOnboardingSession: () => ({ mutate: vi.fn() }),
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({ mutate: vi.fn(), isPending: false }),
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
  sessionStorage.clear();
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
});
