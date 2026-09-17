import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  session: null as { user: { id: string } } | null,
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
  supabase: {
    auth: {
      getSession: state.getSession,
      signInAnonymously: state.signInAnonymously,
    },
  },
}));

const { ensureSupabaseSession, resetSupabaseSessionBootstrap } = await import(
  "#/lib/data-platform/auth-bootstrap"
);

describe("ensureSupabaseSession", () => {
  beforeEach(() => {
    resetSupabaseSessionBootstrap();
    state.isSupabaseConfigured = true;
    state.session = null;
    state.getSession.mockReset();
    state.signInAnonymously.mockReset();
    state.getSession.mockImplementation(async () => ({
      data: { session: state.session },
    }));
  });

  it("returns null without touching auth when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await expect(ensureSupabaseSession()).resolves.toBeNull();
    expect(state.getSession).not.toHaveBeenCalled();
  });

  it("returns the existing session's user id without signing in anonymously", async () => {
    state.session = { user: { id: "user-1" } };
    await expect(ensureSupabaseSession()).resolves.toBe("user-1");
    expect(state.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no existing session", async () => {
    state.signInAnonymously.mockResolvedValue({
      data: { session: { user: { id: "anon-1" } } },
      error: null,
    });
    await expect(ensureSupabaseSession()).resolves.toBe("anon-1");
    expect(state.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("resolves to null when anonymous sign-in errors", async () => {
    state.signInAnonymously.mockResolvedValue({
      data: { session: null },
      error: { message: "anonymous sign-ins disabled" },
    });
    await expect(ensureSupabaseSession()).resolves.toBeNull();
  });

  it("resolves to null instead of throwing when getSession rejects", async () => {
    state.getSession.mockRejectedValue(new Error("network down"));
    await expect(ensureSupabaseSession()).resolves.toBeNull();
  });

  it("shares one in-flight bootstrap across concurrent callers", async () => {
    let resolveSignIn!: (value: {
      data: { session: { user: { id: string } } | null };
      error: null;
    }) => void;
    state.signInAnonymously.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );

    const first = ensureSupabaseSession();
    const second = ensureSupabaseSession();

    resolveSignIn({ data: { session: { user: { id: "anon-2" } } }, error: null });

    await expect(first).resolves.toBe("anon-2");
    await expect(second).resolves.toBe("anon-2");
    expect(state.getSession).toHaveBeenCalledTimes(1);
    expect(state.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("re-reads the session on a later call instead of reusing a stale uid", async () => {
    state.session = { user: { id: "user-1" } };
    await expect(ensureSupabaseSession()).resolves.toBe("user-1");

    state.session = { user: { id: "user-2" } };
    await expect(ensureSupabaseSession()).resolves.toBe("user-2");
    expect(state.getSession).toHaveBeenCalledTimes(2);
  });
});
