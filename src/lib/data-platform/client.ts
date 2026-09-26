/**
 * Single Supabase client for the app's data platform.
 *
 * Every repository in `src/lib/data-platform/repositories/` and every
 * additive sync leg (e.g. `workspace-memory-supabase-sync.ts`) goes through
 * this module rather than calling `createClient` itself. That is what keeps
 * `supabase.from(...)` out of components and existing domain files.
 *
 * Unlike `legacy/src/lib/supabaseClient.ts`, sessions persist (real Supabase
 * Auth, not a single fixed global user) -- see docs/supabase-current-state.md
 * for why this app now has real per-user auth for collaboration features.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

// Under Vitest, keep these modules' unit tests pure/offline -- no background
// syncs to a real database. Real app runs (dev/build/preview) are unaffected.
const IS_TEST_ENV = import.meta.env.MODE === "test";

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) && !IS_TEST_ENV;

// Resolve `fetch` at call time (not module load) so callers that mock
// globalThis.fetch (tests) still work, and bound to a hard timeout so a
// slow/unreachable network never hangs a caller -- every data-platform call
// in this app is either best-effort (writes) or must degrade to a cached/
// local value (reads), never block the UI indefinitely.
//
// If a caller (or the Supabase SDK itself, e.g. via `.abortSignal()`)
// supplies its own signal, it must be combined with -- not replace -- the
// timeout signal via `AbortSignal.any`. Swapping one in for the other would
// silently drop the hard timeout for that call the moment any caller passes
// a signal: the 8s timer would still fire, but `controller.abort()` would
// have no effect because the fetch was never given that controller's signal.
export function timedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      global: { fetch: timedFetch },
    })
  : null;

type GetUserResult = Awaited<ReturnType<SupabaseClient["auth"]["getUser"]>>;

let inFlightGetUser: Promise<GetUserResult> | null = null;

// Several repositories (github/jira connections, jira triggers) each call
// `auth.getUser()` independently during app bootstrap to re-validate the
// session against the Supabase Auth server. When more than one fires in the
// same tick, the browser can cancel one mid-flight and report it as a CORS
// failure instead of a cancellation (no 'Access-Control-Allow-Origin'
// header, even though the endpoint is not actually CORS-blocked) -- see the
// "intermittent getUser() CORS block" report. Sharing one in-flight request
// across concurrent callers removes the race instead of chasing its symptom.
export function getAuthUser(): Promise<GetUserResult> {
  if (!supabase) {
    return Promise.resolve({
      data: { user: null },
      error: null,
    } as unknown as GetUserResult);
  }
  if (!inFlightGetUser) {
    inFlightGetUser = supabase.auth.getUser().finally(() => {
      inFlightGetUser = null;
    });
  }
  return inFlightGetUser;
}
