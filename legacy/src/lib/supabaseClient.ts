// Single Supabase client for the app. No auth/login — every table is scoped
// to one fixed global user (see GLOBAL_USER_ID) and RLS is permissive by design.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_KEY || "";

// Under Vitest, keep these modules' unit tests pure/offline — no background
// syncs to a real database. Real app runs (dev/build/preview) are unaffected.
const IS_TEST_ENV = import.meta.env.MODE === "test";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !IS_TEST_ENV;

// Resolve `fetch` at call time (not at module load) so callers that mock
// globalThis.fetch (tests) or run in environments without a bound fetch
// still work, and bound to a hard timeout so a slow/unreachable network
// never hangs a caller — every write-through call in this app is best-effort.
function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  return fetch(input, { ...init, signal: init?.signal ?? controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { fetch: timedFetch },
    })
  : null;

/** The single global user id — matches AuthContext's LOCAL_USER.uid and the
 * `user_id` default on every table. There is no login in this app. */
export const GLOBAL_USER_ID = "local-user";
