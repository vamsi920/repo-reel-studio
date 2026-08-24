import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { ensureSupabaseSession } from "#/lib/data-platform/auth-bootstrap";
import { workspaceRepository } from "#/lib/data-platform/repositories/workspace-repository";
import { computeWorkspaceId } from "#/lib/workspace-memory";

const PERSONAL_ORG_NAME = "Personal";

/**
 * Every anonymous browser session gets exactly one org, created on first use
 * and reused after (an org row plus a self-join membership row, both allowed
 * by RLS: "authenticated users can create an org" / "creator can self-join
 * their new org as owner"). Not exposed as a concept anywhere in the UI --
 * this is purely the join-key RLS requires to scope everything else.
 */
async function ensurePersonalOrg(userId: string): Promise<string | null> {
  if (!supabase) return null;

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membership?.org_id) return membership.org_id as string;

  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .insert({ name: PERSONAL_ORG_NAME, created_by: userId })
    .select("id")
    .single();
  if (orgError || !org) return null;

  const { error: memberError } = await supabase
    .from("org_members")
    .insert({ org_id: org.id, user_id: userId, role: "owner" });
  if (memberError) return null;

  return org.id as string;
}

/**
 * Resolves this browser's org, bootstrapping auth + org membership along the
 * way. `repositories`/`knowledge_generations`/`codegraph_snapshots` are all
 * ultimately gated by workspace membership (not org membership) for RLS
 * purposes, but resolving the org id needs no live conversation/workspace
 * context at all -- safe to call from a cold page load with nothing else
 * known yet.
 */
export async function resolveOrgId(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const userId = await ensureSupabaseSession();
    if (!userId) return null;
    return await ensurePersonalOrg(userId);
  } catch {
    return null;
  }
}

/**
 * Read-only lookup -- does not create a `repositories` row. Used for cold
 * rehydration, where fabricating a row for a repo that was never actually
 * generated would be a pointless write on every page view.
 */
export async function findRepositoryUuid(
  orgId: string,
  owner: string,
  name: string,
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("repositories")
      .select("id")
      .eq("org_id", orgId)
      .eq("owner", owner)
      .eq("name", name)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function ensureWorkspaceMembership(
  userId: string,
  orgId: string,
  workspaceId: string,
  backendId: string,
  path: string,
  name?: string,
): Promise<boolean> {
  if (!supabase) return false;

  const { ok } = await workspaceRepository.ensureWorkspace({
    id: workspaceId,
    orgId,
    backendId,
    path,
    name,
  });
  if (!ok) return false;

  const { error } = await supabase
    .from("workspace_members")
    .upsert(
      { workspace_id: workspaceId, user_id: userId, role: "owner" },
      { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
    );
  return !error;
}

async function ensureRepositoryRow(
  orgId: string,
  owner: string,
  name: string,
  branch: string,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("repositories")
    .upsert(
      { org_id: orgId, owner, name, default_branch: branch },
      { onConflict: "org_id,owner,name" },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

export interface WorkspaceAccessInput {
  workspaceId: string;
  backendId: string;
  path: string;
  name?: string;
}

/**
 * The identity bootstrap alone -- session + org + workspace + membership --
 * without `resolvePersistenceIds`'s repository-row step, which needs an
 * `owner`/`repo`/`branch` that a plain local workspace (no repository
 * generation involved) never has. Once this resolves `true`, every other
 * write already gated by `is_workspace_member(workspaceId)` for this
 * workspace -- `memory_records`, `activity_events`, `usage_events` -- starts
 * actually persisting instead of silently failing RLS with no session.
 */
export async function ensureWorkspaceAccess(
  input: WorkspaceAccessInput,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const userId = await ensureSupabaseSession();
    if (!userId) return false;

    const orgId = await ensurePersonalOrg(userId);
    if (!orgId) return false;

    return await ensureWorkspaceMembership(
      userId,
      orgId,
      input.workspaceId,
      input.backendId,
      input.path,
      input.name,
    );
  } catch {
    return false;
  }
}

export interface PersistenceIds {
  workspaceId: string;
  repositoryUuid: string;
}

export interface PersistenceIdentityInput {
  owner: string;
  repo: string;
  branch: string;
  localPath: string;
  backendId: string;
}

/**
 * The full write-path resolver: session + org + workspace membership +
 * repository row (created if missing). Requires a live snapshot (backendId +
 * localPath), so only ever called right after a real generation/analysis
 * completes -- never from a cold page load. For read-only cold rehydration,
 * use `resolveOrgId` + `findRepositoryUuid` instead, which need neither.
 */
export async function resolvePersistenceIds(
  input: PersistenceIdentityInput,
): Promise<PersistenceIds | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const userId = await ensureSupabaseSession();
    if (!userId) return null;

    const orgId = await ensurePersonalOrg(userId);
    if (!orgId) return null;

    const workspaceId = computeWorkspaceId(input.backendId, input.localPath);
    if (!workspaceId) return null;

    const memberOk = await ensureWorkspaceMembership(
      userId,
      orgId,
      workspaceId,
      input.backendId,
      input.localPath,
    );
    if (!memberOk) return null;

    const repositoryUuid = await ensureRepositoryRow(
      orgId,
      input.owner,
      input.repo,
      input.branch,
    );
    if (!repositoryUuid) return null;

    return { workspaceId, repositoryUuid };
  } catch {
    return null;
  }
}
