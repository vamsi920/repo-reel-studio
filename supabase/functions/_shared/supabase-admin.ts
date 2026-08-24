import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Service-role client -- bypasses RLS entirely. Only ever used inside these
 * GitHub-connection Edge Functions, never returned to or constructible by
 * the browser (SUPABASE_SERVICE_ROLE_KEY is an Edge Function secret, not a
 * VITE_* var).
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Resolves the caller's user id from the Authorization header's Supabase
 * JWT, verified against the anon-key client (signature + expiry check).
 * Returns null if the request isn't from a signed-in user.
 */
export async function getCallerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await client.auth.getUser();
  return user?.id ?? null;
}
