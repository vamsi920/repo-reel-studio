import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useStartOnboardingSession } from "#/hooks/query/use-onboarding-session";

const state = vi.hoisted(() => ({
  insertError: null as { code: string; message: string } | null,
  existing: null as Record<string, unknown> | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: state.insertError }),
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.existing, error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("#/hooks/query/use-environment-org", () => ({
  useEnvironmentOrgId: () => ({ data: "org-1" }),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useStartOnboardingSession", () => {
  beforeEach(() => {
    state.insertError = null;
    state.existing = {
      id: "session-1",
      conversation_id: "conv-existing",
      phase: "discovery",
      status: "active",
      started_by: "someone-else",
      created_at: "2026-09-01T00:00:00.000Z",
    };
  });

  it("joins the existing active session when the insert fails on the unique-active-session-per-org index", async () => {
    state.insertError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    };

    const { result } = renderHook(() => useStartOnboardingSession(), {
      wrapper: makeWrapper(),
    });

    result.current.mutate("conv-new");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.conversationId).toBe("conv-existing");
  });

  // Regression: any insert error used to fall through to "someone else's
  // session must already exist", so a genuine failure (RLS denial, malformed
  // payload, transient network error) that happened to coincide with an
  // unrelated active session for the org was silently swallowed -- the
  // caller believed a session existed when the insert never actually
  // succeeded.
  it("still fails on a non-unique-violation error even when an active session happens to exist", async () => {
    state.insertError = {
      code: "42501",
      message: "permission denied for table onboarding_sessions",
    };

    const { result } = renderHook(() => useStartOnboardingSession(), {
      wrapper: makeWrapper(),
    });

    result.current.mutate("conv-new");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "permission denied for table onboarding_sessions",
    );
  });

  it("fails when the insert errors and no existing active session can be found either", async () => {
    state.insertError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    };
    state.existing = null;

    const { result } = renderHook(() => useStartOnboardingSession(), {
      wrapper: makeWrapper(),
    });

    result.current.mutate("conv-new");

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
