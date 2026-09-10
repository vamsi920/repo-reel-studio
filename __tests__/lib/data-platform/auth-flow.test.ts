import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  allowlistRows: [] as { domain: string }[],
  allowlistError: null as { message: string } | null,
  session: null as { user: { is_anonymous: boolean } } | null,
  updateUser: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: async () => ({
        data: state.allowlistError ? null : state.allowlistRows,
        error: state.allowlistError,
      }),
    }),
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      updateUser: state.updateUser,
      signUp: state.signUp,
      signInWithPassword: state.signInWithPassword,
    },
    functions: { invoke: state.invoke },
  },
}));

// Imported after the mock so the module binds to the fake client.
const {
  directPasswordReset,
  isEmailInDomainAllowlist,
  loadSignupDomainAllowlist,
  resetSignupDomainAllowlistCache,
  signInWithPassword,
  signUpWithPassword,
} = await import("#/lib/data-platform/auth-flow");

/** Shape of the `FunctionsHttpError` supabase-js raises for a non-2xx reply. */
function functionsHttpError(body: unknown) {
  return {
    message: "Edge Function returned a non-2xx status code",
    context: { json: async () => body },
  };
}

describe("auth-flow", () => {
  beforeEach(() => {
    resetSignupDomainAllowlistCache();
    state.allowlistRows = [];
    state.allowlistError = null;
    state.session = null;
    state.updateUser.mockReset();
    state.signUp.mockReset();
    state.signInWithPassword.mockReset();
    state.invoke.mockReset();
  });

  describe("loadSignupDomainAllowlist", () => {
    it("normalises rows and caches them for later callers", async () => {
      state.allowlistRows = [{ domain: " NeoDevEx.com " }, { domain: "" }];
      await expect(loadSignupDomainAllowlist()).resolves.toEqual([
        "neodevex.com",
      ]);

      state.allowlistRows = [{ domain: "other.example" }];
      await expect(loadSignupDomainAllowlist()).resolves.toEqual([
        "neodevex.com",
      ]);
    });

    it("resolves to 'no restriction' when the table can't be read", async () => {
      state.allowlistError = { message: "permission denied" };
      await expect(loadSignupDomainAllowlist()).resolves.toEqual([]);
    });
  });

  describe("isEmailInDomainAllowlist", () => {
    it("allows everything when the list is empty and matches case-insensitively otherwise", () => {
      expect(isEmailInDomainAllowlist("anyone@anywhere.test", [])).toBe(true);
      expect(
        isEmailInDomainAllowlist("Me@NeoDevEx.COM", ["neodevex.com"]),
      ).toBe(true);
      expect(isEmailInDomainAllowlist("me@other.test", ["neodevex.com"])).toBe(
        false,
      );
      expect(isEmailInDomainAllowlist("not-an-email", ["neodevex.com"])).toBe(
        false,
      );
    });
  });

  describe("signUpWithPassword", () => {
    it("upgrades an anonymous session in place instead of creating a second user", async () => {
      state.session = { user: { is_anonymous: true } };
      state.updateUser.mockResolvedValue({ error: null });

      await expect(
        signUpWithPassword("  me@neodevex.com ", "hunter22"),
      ).resolves.toEqual({ kind: "signed_in" });
      expect(state.updateUser).toHaveBeenCalledWith({
        email: "me@neodevex.com",
        password: "hunter22",
      });
      expect(state.signUp).not.toHaveBeenCalled();
    });

    it("reports already_exists from the upgrade path by code or by message", async () => {
      state.session = { user: { is_anonymous: true } };
      state.updateUser.mockResolvedValueOnce({
        error: { code: "email_exists", message: "" },
      });
      await expect(
        signUpWithPassword("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "already_exists" });

      state.updateUser.mockResolvedValueOnce({
        error: {
          message: "A user with this email address has already been registered",
        },
      });
      await expect(
        signUpWithPassword("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "already_exists" });
    });

    it("rejects a non-allowlisted domain before touching the auth API", async () => {
      state.allowlistRows = [{ domain: "neodevex.com" }];
      await expect(
        signUpWithPassword("me@elsewhere.test", "hunter22"),
      ).resolves.toEqual({ kind: "domain_rejected" });
      expect(state.signUp).not.toHaveBeenCalled();
      expect(state.updateUser).not.toHaveBeenCalled();
    });
  });

  describe("signInWithPassword", () => {
    it("maps GoTrue's invalid-credentials reply to its own outcome", async () => {
      state.signInWithPassword.mockResolvedValueOnce({
        error: {
          code: "invalid_credentials",
          message: "Invalid login credentials",
        },
      });
      await expect(
        signInWithPassword("me@neodevex.com", "wrong"),
      ).resolves.toEqual({ kind: "invalid_credentials" });

      // Older GoTrue builds send the message without a `code`.
      state.signInWithPassword.mockResolvedValueOnce({
        error: { message: "Invalid login credentials" },
      });
      await expect(
        signInWithPassword("me@neodevex.com", "wrong"),
      ).resolves.toEqual({ kind: "invalid_credentials" });
    });

    it("passes other auth errors through with their message", async () => {
      state.signInWithPassword.mockResolvedValueOnce({
        error: {
          code: "over_request_rate_limit",
          message: "Too many requests",
        },
      });
      await expect(
        signInWithPassword("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "error", message: "Too many requests" });
    });
  });

  describe("directPasswordReset", () => {
    it("maps the Edge Function's structured rejections", async () => {
      state.invoke.mockResolvedValueOnce({
        data: null,
        error: functionsHttpError({ error: "no_account" }),
      });
      await expect(
        directPasswordReset("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "no_account" });

      state.invoke.mockResolvedValueOnce({
        data: null,
        error: functionsHttpError({ error: "domain_rejected" }),
      });
      await expect(
        directPasswordReset("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "domain_rejected" });
    });

    it("never surfaces functions-js boilerplate or a machine code as the user-facing message", async () => {
      state.invoke.mockResolvedValueOnce({
        data: null,
        error: functionsHttpError({ error: "lookup_failed" }),
      });
      await expect(
        directPasswordReset("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "error" });

      state.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: "Failed to send a request to the Edge Function" },
      });
      await expect(
        directPasswordReset("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "error" });
    });

    it("reports changed only on an explicit ok", async () => {
      state.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
      await expect(
        directPasswordReset("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "changed" });

      state.invoke.mockResolvedValueOnce({ data: null, error: null });
      await expect(
        directPasswordReset("me@neodevex.com", "hunter22"),
      ).resolves.toEqual({ kind: "error" });
    });
  });
});
