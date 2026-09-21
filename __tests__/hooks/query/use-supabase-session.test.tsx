import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import {
  ENVIRONMENT_QUERY_KEYS,
  GITHUB_CONNECTION_QUERY_KEY,
  JIRA_CONNECTION_QUERY_KEY,
} from "#/hooks/query/query-keys";

type AuthChangeCallback = (
  event: string,
  session: { user: { id: string; is_anonymous?: boolean } } | null,
) => void;

const state = vi.hoisted(() => ({
  authChangeCallback: null as AuthChangeCallback | null,
  unsubscribe: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (callback: AuthChangeCallback) => {
        state.authChangeCallback = callback;
        return { data: { subscription: { unsubscribe: state.unsubscribe } } };
      },
    },
  },
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function session(userId: string) {
  return { user: { id: userId, is_anonymous: false } };
}

beforeEach(() => {
  state.authChangeCallback = null;
  state.unsubscribe.mockReset();
});

describe("useSupabaseSession", () => {
  it("does not invalidate org/connection caches on the listener's own initial fire", () => {
    const { client, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useSupabaseSession(), { wrapper });

    expect(state.authChangeCallback).not.toBeNull();
    invalidate.mockClear();
    state.authChangeCallback!("INITIAL_SESSION", session("user-a"));

    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ENVIRONMENT_QUERY_KEYS.all }),
    );
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: GITHUB_CONNECTION_QUERY_KEY }),
    );
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: JIRA_CONNECTION_QUERY_KEY }),
    );
  });

  it("invalidates environment/org and provider-connection caches when the signed-in user actually changes", () => {
    const { client, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useSupabaseSession(), { wrapper });

    // First event just establishes the baseline identity.
    state.authChangeCallback!("INITIAL_SESSION", session("user-a"));
    invalidate.mockClear();

    // Second event hands off to a different signed-in user in the same tab.
    state.authChangeCallback!("SIGNED_IN", session("user-b"));

    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ENVIRONMENT_QUERY_KEYS.all }),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: GITHUB_CONNECTION_QUERY_KEY }),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: JIRA_CONNECTION_QUERY_KEY }),
    );
  });

  it("does not invalidate those caches when the same user's session merely refreshes", () => {
    const { client, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useSupabaseSession(), { wrapper });

    state.authChangeCallback!("INITIAL_SESSION", session("user-a"));
    invalidate.mockClear();

    // A token refresh re-fires the listener with the same user, not a switch.
    state.authChangeCallback!("TOKEN_REFRESHED", session("user-a"));

    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ENVIRONMENT_QUERY_KEYS.all }),
    );
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: GITHUB_CONNECTION_QUERY_KEY }),
    );
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: JIRA_CONNECTION_QUERY_KEY }),
    );
  });

  it("treats sign-out (session goes null) after a real session as an identity change too", () => {
    const { client, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useSupabaseSession(), { wrapper });

    state.authChangeCallback!("INITIAL_SESSION", session("user-a"));
    invalidate.mockClear();

    state.authChangeCallback!("SIGNED_OUT", null);

    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ENVIRONMENT_QUERY_KEYS.all }),
    );
  });
});
