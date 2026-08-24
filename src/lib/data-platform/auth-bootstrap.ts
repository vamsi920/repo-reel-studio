import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

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
 */
export async function ensureSupabaseSession(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session?.user.id) return existing.session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session?.user.id) return null;
    return data.session.user.id;
  } catch {
    return null;
  }
}
