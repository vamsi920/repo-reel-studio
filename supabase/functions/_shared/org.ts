import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Resolves the team the caller is working in. Mirrors `resolve_active_team`
 * in the database (the function the browser calls): the team the user chose
 * in the team switcher while it is still a live team they belong to,
 * otherwise their personal team. Both sides read the same
 * `user_team_preferences` row, so a connection saved from the browser lands
 * in the team the browser is showing.
 */
export async function getCallerOrgId(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: memberships, error } = await admin
    .from("org_members")
    .select("org_id, created_at, orgs!inner(is_personal, archived_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !memberships) return null;

  type Membership = {
    org_id: string;
    orgs:
      | { is_personal: boolean; archived_at: string | null }
      | { is_personal: boolean; archived_at: string | null }[];
  };
  const live = (memberships as Membership[])
    .map((row) => ({
      orgId: row.org_id,
      org: Array.isArray(row.orgs) ? row.orgs[0] : row.orgs,
    }))
    .filter((row) => row.org && !row.org.archived_at);
  if (live.length === 0) return null;

  const { data: preference } = await admin
    .from("user_team_preferences")
    .select("active_org_id")
    .eq("user_id", userId)
    .maybeSingle();
  const chosen = preference?.active_org_id as string | null | undefined;
  if (chosen && live.some((row) => row.orgId === chosen)) return chosen;

  // No (valid) choice: the personal team, or the oldest membership for an
  // account that somehow has none.
  return (live.find((row) => row.org.is_personal) ?? live[0]).orgId;
}

// `viewer` is a read-only seat: it ranks below every role a write asks for.
const ROLE_RANK: Record<string, number> = {
  viewer: 0,
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
