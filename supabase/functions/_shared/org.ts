import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Resolves the caller's org. Mirrors `ensurePersonalOrg` on the client
 * (`src/lib/data-platform/repositories/repository-identity.ts`): oldest
 * membership wins, which is the personal org for anyone who has not been
 * invited elsewhere.
 */
export async function getCallerOrgId(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.org_id as string;
}

const ROLE_RANK: Record<string, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Connection writes and profile changes are administrative acts: they decide
 * what the whole organisation's agents can reach. A plain member reading the
 * readiness board is fine; a plain member swapping the source-control
 * provider is not.
 */
export async function requireOrgRole(
  admin: SupabaseClient,
  userId: string,
  orgId: string,
  minRole: "member" | "admin" | "owner",
): Promise<boolean> {
  const { data, error } = await admin
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !data) return false;
  const rank = ROLE_RANK[data.role as string] ?? 0;
  return rank >= (ROLE_RANK[minRole] ?? 99);
}
