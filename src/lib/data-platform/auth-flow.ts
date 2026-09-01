import type { NavigateFunction } from "react-router";
import { supabase, isSupabaseConfigured } from "./client";

/**
 * Seed domain for this deployment. Kept only as the value the
 * `signup_domain_allowlist` table is seeded with (see
 * `supabase/migrations/20260830090000_signup_domain_allowlist.sql`); nothing
 * reads it as a hardcoded rule any more.
 */
export const NEODEVEX_EMAIL_DOMAIN = "neodevex.com";

let cachedAllowlist: string[] | null = null;
let inFlightAllowlist: Promise<string[]> | null = null;

/**
 * Loads the deployment's signup domain allowlist, cached for the tab's
 * lifetime. An empty list means "no restriction" -- the same rule the
 * `enforce_signup_domain_allowlist` trigger applies server-side, so a fresh
 * customer install accepts any address until an admin narrows it.
 *
 * Every failure path resolves to `[]` rather than rejecting: this is a UX
 * pre-check, and a deployment whose allowlist cannot be read must not be
 * locked out of its own login screen. The trigger remains the real boundary.
 */
export async function loadSignupDomainAllowlist(): Promise<string[]> {
  if (cachedAllowlist) return cachedAllowlist;
  if (inFlightAllowlist) return inFlightAllowlist;
  if (!isSupabaseConfigured || !supabase) {
    cachedAllowlist = [];
    return cachedAllowlist;
  }

  inFlightAllowlist = (async () => {
    try {
      const { data, error } = await supabase!
        .from("signup_domain_allowlist")
        .select("domain");
      if (error || !data) return [];
      return data
        .map((row) => String((row as { domain: unknown }).domain ?? ""))
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean);
    } catch {
      return [];
    } finally {
      inFlightAllowlist = null;
    }
  })().then((domains) => {
    cachedAllowlist = domains;
    return domains;
  });

  return inFlightAllowlist;
}

/** Test seam -- forces the next `loadSignupDomainAllowlist` to re-query. */
export function resetSignupDomainAllowlistCache(): void {
  cachedAllowlist = null;
  inFlightAllowlist = null;
}

/**
 * Client-side pre-check only, for instant form feedback before a network
 * round-trip. Not the security boundary -- anyone can call the Supabase Auth
 * API directly, bypassing this entirely. The real enforcement is the
 * `enforce_signup_domain_allowlist` trigger on `auth.users` (see
 * `supabase/migrations/20260830090000_signup_domain_allowlist.sql`), which
 * fires on both `insert` (signUp) and `update of email` (the anonymous
 * upgrade path below), so it isn't tied to any particular auth method.
 *
 * `domains` empty => everything is allowed, matching the trigger.
 */
export function isEmailInDomainAllowlist(
  email: string,
  domains: string[],
): boolean {
  if (domains.length === 0) return true;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return false;
  const domain = trimmed.slice(at + 1);
  return domains.some((allowed) => allowed.toLowerCase() === domain);
}

/** Async convenience wrapper that resolves the allowlist first. */
export async function isAllowedSignupEmail(email: string): Promise<boolean> {
  return isEmailInDomainAllowlist(email, await loadSignupDomainAllowlist());
}

export type AuthOutcome =
  | { kind: "signed_in" }
  | { kind: "domain_rejected" }
  | { kind: "already_exists" }
  | { kind: "error"; message: string };

/**
 * Error codes/messages that mean "this email already belongs to a
 * different, permanent account" -- the signal to stop attempting an
 * anonymous-session upgrade and tell the user to sign in instead. Matched on
 * both `error.code` (current auth-js) and a message substring (older/
 * self-hosted GoTrue versions that don't populate `code`).
 */
function isEmailAlreadyRegisteredError(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return true;
  }
  return /already registered|already exists/i.test(error.message ?? "");
}

/**
 * Creates a real account, upgrading the current browser's anonymous session
 * in place when there is one (preserves `auth.uid()`, so every org/workspace
 * row already tied to this browser carries over -- see `ensurePersonalOrg`
 * in `repositories/repository-identity.ts`). Requires "Confirm email" to be
 * disabled in the Supabase project (Authentication -> Providers -> Email) so
 * the returned session is active immediately, with no email round-trip.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const trimmedEmail = email.trim();
  if (!(await isAllowedSignupEmail(trimmedEmail))) {
    return { kind: "domain_rejected" };
  }
  if (!isSupabaseConfigured || !supabase) {
    return {
      kind: "error",
      message: "Sign-in is not configured for this deployment.",
    };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user.is_anonymous) {
      const { error } = await supabase.auth.updateUser({
        email: trimmedEmail,
        password,
      });
      if (!error) return { kind: "signed_in" };
      if (isEmailAlreadyRegisteredError(error)) {
        return { kind: "already_exists" };
      }
      return { kind: "error", message: error.message };
    }

    const { error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });
    if (error) {
      if (isEmailAlreadyRegisteredError(error)) {
        return { kind: "already_exists" };
      }
      return { kind: "error", message: error.message };
    }
    return { kind: "signed_in" };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * Signs out of Supabase (if configured) and sends the browser to /login.
 * Shared by the Settings "Account" section and the sidebar user menu so
 * there is exactly one sign-out code path to keep in sync with future auth
 * changes (e.g. clearing other client-side caches on logout).
 */
export async function signOutAndRedirect(
  navigate: NavigateFunction,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
  navigate("/login", { replace: true });
}

export type PasswordResetRequestOutcome =
  | { kind: "sent" }
  | { kind: "domain_rejected" }
  | { kind: "error"; message: string };

/**
 * Requests a password-reset email. Always returns `"sent"` on a successful
 * API call, whether or not the address belongs to a real account -- Supabase
 * itself never reveals that distinction (anti-enumeration), so this doesn't
 * either. `domain_rejected` is purely the same friendly client-side hint
 * `signUpWithPassword`/`signInWithPassword` give; it's not a security
 * boundary (the trigger doesn't fire on this path either way, since
 * `resetPasswordForEmail` never touches `auth.users.email`).
 *
 * `redirectTo` must be on the project's Supabase Auth "Redirect URLs"
 * allowlist (Authentication -> URL Configuration) or the emailed link will
 * bounce to a generic Supabase error page instead of `/reset-password`.
 */
export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetRequestOutcome> {
  const trimmedEmail = email.trim();
  if (!(await isAllowedSignupEmail(trimmedEmail))) {
    return { kind: "domain_rejected" };
  }
  if (!isSupabaseConfigured || !supabase) {
    return {
      kind: "error",
      message: "Sign-in is not configured for this deployment.",
    };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { kind: "error", message: error.message };
    return { kind: "sent" };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * Sets a new password from inside an active `PASSWORD_RECOVERY` session (the
 * one Supabase's client establishes automatically when a user lands on
 * `/reset-password` via the emailed link). Requires that session to already
 * exist -- this doesn't itself verify a recovery token, it just calls
 * `updateUser`, same as any other authenticated password change.
 */
export async function updatePasswordForRecovery(
  newPassword: string,
): Promise<AuthOutcome> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      kind: "error",
      message: "Sign-in is not configured for this deployment.",
    };
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) return { kind: "error", message: error.message };
    return { kind: "signed_in" };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * Signs in to an existing account. Never treated as an anonymous-session
 * upgrade -- only `signUpWithPassword` does that, since signing in to an
 * account that already exists isn't "this browser's data becoming real,"
 * it's switching to a different, already-established identity.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const trimmedEmail = email.trim();
  if (!(await isAllowedSignupEmail(trimmedEmail))) {
    return { kind: "domain_rejected" };
  }
  if (!isSupabaseConfigured || !supabase) {
    return {
      kind: "error",
      message: "Sign-in is not configured for this deployment.",
    };
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (error) return { kind: "error", message: error.message };
    return { kind: "signed_in" };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
