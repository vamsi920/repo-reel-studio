import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * In-flight bootstrap, shared by every concurrent caller. A cold page load
 * runs several independent consumers at once (`use-supabase-identity`,
 * `use-environment-org`, the `/kt/*` loaders), and each one calling
 * `signInAnonymously()` after its own `getSession()` came back empty would
 * mint a *separate* anonymous user. The client keeps only the last session,
 * so every org/workspace/membership row written under the earlier uids is
 * immediately orphaned and invisible to the surviving one.
 */
let inFlightSession: Promise<string | null> | null = null;

/**
 * Every RLS policy in this schema gates on `auth.uid()`, but this app has no
 * sign-in flow -- so without a session, every `supabase.from(...)` write and
 * most reads silently return zero rows (RLS default-denies). Anonymous
 * Supabase Auth gives every browser a real, persisted `auth.uid()` (flagged
 * `is_anonymous: true`) without any login UI. Requires "Anonymous sign-ins"
 * enabled in the Supabase project's Authentication settings -- if it isn't,
 * this fails closed (returns null) and every data-platform call above it
 * degrades to today's in-memory-only behavior, same as when Supabase isn't
 * configured at all.
 *
 * Concurrent calls share one bootstrap (see `inFlightSession`); the promise
 * is released once it settles, so a later call still re-reads the session
 * rather than caching a uid that a real sign-in/sign-out has since changed.
 */
export async function ensureSupabaseSession(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  if (inFlightSession) return inFlightSession;

  const bootstrap = (async (): Promise<string | null> => {
    try {
      const { data: existing } = await supabase!.auth.getSession();
      if (existing.session?.user.id) return existing.session.user.id;

      const { data, error } = await supabase!.auth.signInAnonymously();
      if (error || !data.session?.user.id) return null;
      return data.session.user.id;
    } catch {
      return null;
    }
  })();
  inFlightSession = bootstrap;

  try {
    return await bootstrap;
  } finally {
    if (inFlightSession === bootstrap) inFlightSession = null;
  }
}

/** Test seam -- drops any in-flight bootstrap so the next call starts clean. */
export function resetSupabaseSessionBootstrap(): void {
  inFlightSession = null;
}
