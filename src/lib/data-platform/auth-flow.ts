import type { NavigateFunction } from "react-router";
import { supabase, isSupabaseConfigured } from "./client";

export const NEODEVEX_EMAIL_DOMAIN = "neodevex.com";

/**
 * Client-side pre-check only, for instant form feedback before a network
 * round-trip. Not the security boundary -- anyone can call the Supabase Auth
 * API directly, bypassing this entirely. The real enforcement is the
 * `enforce_neodevex_email_domain` trigger on `auth.users` (see
 * `supabase/migrations/20260824120000_restrict_signup_domain.sql`), which
 * fires on both `insert` (signUp) and `update of email` (the anonymous
 * upgrade path below), so it isn't tied to any particular auth method.
 */
export function isAllowedSignupEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  return trimmed.endsWith(`@${NEODEVEX_EMAIL_DOMAIN}`);
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
  if (!isAllowedSignupEmail(trimmedEmail)) {
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
  if (!isAllowedSignupEmail(trimmedEmail)) {
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
