import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureWorkspaceAccess = vi.hoisted(() => vi.fn());

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { id: "backend-1", kind: "local" } }),
}));

vi.mock("#/lib/data-platform", () => ({ ensureWorkspaceAccess }));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: { workspace: { working_dir: "/workspace/project" } },
  }),
}));

vi.mock("#/hooks/use-workspace-id", () => ({
  useWorkspaceId: () => "ws_test",
}));

const { useSupabaseIdentity } = await import("#/hooks/use-supabase-identity");

describe("useSupabaseIdentity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ensureWorkspaceAccess.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bootstraps the workspace exactly once after it succeeds", async () => {
    ensureWorkspaceAccess.mockResolvedValue(true);
    const { rerender } = renderHook(() => useSupabaseIdentity());

    await vi.waitFor(() =>
      expect(ensureWorkspaceAccess).toHaveBeenCalledWith({
        workspaceId: "ws_test",
        backendId: "backend-1",
        path: "/workspace/project",
        name: "project",
      }),
    );
    expect(ensureWorkspaceAccess).toHaveBeenCalledTimes(1);

    rerender();
    await vi.advanceTimersByTimeAsync(0);
    expect(ensureWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  it("retries with backoff after a transient bootstrap failure instead of giving up for the session", async () => {
    ensureWorkspaceAccess
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    renderHook(() => useSupabaseIdentity());

    await vi.waitFor(() => expect(ensureWorkspaceAccess).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(ensureWorkspaceAccess).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(ensureWorkspaceAccess).toHaveBeenCalledTimes(3));
  });

  it("stops retrying and cleans up its timer when unmounted mid-backoff", async () => {
    ensureWorkspaceAccess.mockResolvedValue(false);
    const { unmount } = renderHook(() => useSupabaseIdentity());

    await vi.waitFor(() => expect(ensureWorkspaceAccess).toHaveBeenCalledTimes(1));
    unmount();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(ensureWorkspaceAccess).toHaveBeenCalledTimes(1);
  });
});
