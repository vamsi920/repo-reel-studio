import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { ensureSupabaseSession } from "#/lib/data-platform/auth-bootstrap";
import { workspaceRepository } from "#/lib/data-platform/repositories/workspace-repository";
import {
  computeWorkspaceId,
  normalizeWorkspacePath,
} from "#/lib/workspace-memory";

const PERSONAL_ORG_NAME = "Personal";

function logFailure(step: string, error: unknown): void {
  // failure was previously invisible (bare `return null`, no logging at
  // all), which is exactly why the org bootstrap silently never worked for
  // any user, real or anonymous, for this project's entire history.
  console.error(`[repository-identity] ${step} failed`, error);
}

function newOrgId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `org-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Every browser session gets exactly one org, created on first use and
 * reused after (an org row plus a self-join membership row, both allowed by
 * RLS: "authenticated users can create an org" / "creator can self-join
 * their new org as owner"). Not exposed as a concept anywhere in the UI --
 * this is purely the join-key RLS requires to scope everything else.
 *
 * The org id is generated CLIENT-SIDE and inserted without `.select()`
 * deliberately: `orgs`' SELECT policy is `is_org_member(id)`, which can't be
 * satisfied until the `org_members` self-join row below exists. Chaining
 * `.select().single()` onto the insert makes Postgres enforce that SELECT
 * policy against the INSERT's own RETURNING clause as part of the same
 * statement -- a real, verified 42501 on every attempt, not a hypothetical
 * edge case (confirmed against the live project: this was the entire reason
 * the org bootstrap has never worked for any user). No RETURNING needed
 * anyway, since the id is already known.
 */
async function ensurePersonalOrg(userId: string): Promise<string | null> {
  if (!supabase) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError) logFailure("org_members lookup", membershipError);
  if (membership?.org_id) return membership.org_id as string;

  const orgId = newOrgId();
  const { error: orgError } = await supabase
    .from("orgs")
    .insert({ id: orgId, name: PERSONAL_ORG_NAME, created_by: userId });
  if (orgError) {
    logFailure("orgs insert", orgError);
    return null;
  }

  const { error: memberError } = await supabase
    .from("org_members")
    .insert({ org_id: orgId, user_id: userId, role: "owner" });
  // 23505 (unique violation) means a concurrent call already self-joined
  // this exact org -- benign, not a real failure. See ensureWorkspaceMembership
  // for why this must stay a plain insert, never `.upsert()`.
  if (memberError && memberError.code !== "23505") {
    logFailure("org_members self-join insert", memberError);
    return null;
  }

  return orgId;
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
  } catch (error) {
    logFailure("resolveOrgId", error);
    return null;
  }
}

/**
 * Read-only lookup -- does not create a `repositories` row. Used for cold
 * rehydration, where fabricating a row for a repo that was never actually
 * generated would be a pointless write on every page view.
 *
 * `localPath`, when known, disambiguates two different local folders that
 * share a basename (the `(org_id, owner, name)` key alone collides for
 * those). Pass it whenever a live snapshot is available. Cold rehydration
 * from a bare URL (`repositoryId` like `local/<name>@<branch>`) genuinely
 * doesn't carry the full local path, so `localPath` is omitted there --
 * falls back to the most recently generated match for that owner/name,
 * which is correct for the common single-folder case and only ambiguous
 * for the rarer same-basename-two-folders case (a real, accepted limitation
 * of this app's local-repo URL scheme, not something this lookup alone can
 * resolve).
 */
export async function findRepositoryUuid(
  orgId: string,
  owner: string,
  name: string,
  localPath?: string,
): Promise<string | null> {
  if (!supabase) return null;
  try {
    let query = supabase
      .from("repositories")
      .select("id")
      .eq("org_id", orgId)
      .eq("owner", owner)
      .eq("name", name);
    if (localPath) {
      query = query.eq("local_path", normalizeWorkspacePath(localPath));
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) logFailure("repositories lookup", error);
    return (data?.[0]?.id as string | undefined) ?? null;
  } catch (error) {
    logFailure("findRepositoryUuid", error);
    return null;
  }
}

/**
 * `computeWorkspaceId(backendId, path)` is a PURE function of backend+path
 * -- by design, so Workspace Memory's local isolation boundary stays stable
 * (never change what that function returns). But this makes it a poor
 * primary key for the Supabase `workspaces` table specifically: the
 * AgentOps sidecar (`scripts/agentops/supabase-store.mjs`) independently
 * writes its own `workspaces` row for the exact same backend+path, under a
 * fixed system org (`DEFAULT_ORG_ID`) that no real signed-in user is ever a
 * member of. Confirmed live: every `workspaces` row in the project belonged
 * to that seed org, so this code's own upsert onto the SAME id always hit
 * the row's UPDATE path (not INSERT, since the row already existed) and
 * failed `has_workspace_role(id, 'admin')` for every real user, every time
 * -- a 100%-reproducing collision, not an edge case. Scoping the id by
 * `orgId` here (Supabase-identity use only) gives each org/user its own
 * distinct workspace row for the same physical path, with zero change to
 * `computeWorkspaceId` itself or anything outside this file.
 */
function orgScopedWorkspaceId(
  orgId: string,
  backendId: string,
  path: string,
): string | null {
  const base = computeWorkspaceId(backendId, path);
  return base ? `${orgId}_${base}` : null;
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

  const { ok, error: workspaceError } =
    await workspaceRepository.ensureWorkspace({
      id: workspaceId,
      orgId,
      backendId,
      path,
      name,
    });
  if (!ok) {
    logFailure("workspaces upsert", workspaceError);
    return false;
  }

  // A PLAIN insert, never `.upsert()` -- directly reproduced and confirmed:
  // `workspace_members`' own SELECT policy (is_workspace_member(workspace_id))
  // is self-referential for a brand-new membership row, and Postgres's
  // `ON CONFLICT` conflict-detection (even `DO NOTHING`) needs to evaluate
  // that SELECT policy to check for an existing row -- which fails RLS
  // (42501) even when there is no actual conflict, since the row can't be
  // "seen" as existing OR not-existing while its own visibility depends on
  // itself. A plain insert has no such conflict-detection step; a genuine
  // repeat call instead raises a normal unique-violation (23505), which is
  // the real, correct signal for "already a member" and is treated as
  // success rather than logged as a failure.
  const { error } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: userId, role: "owner" });
  if (error && error.code !== "23505") {
    logFailure("workspace_members insert", error);
    return false;
  }
  return true;
}

/** `localPath` disambiguates two different local folders sharing a
 * basename (e.g. the same repo cloned to two places) -- without it,
 * `(org_id, owner, name)` alone collides them into one row. Only set for
 * `owner === "local"`; GitHub-connected repos keep `local_path: ''` so they
 * still correctly dedupe to one row across workspaces. */
async function ensureRepositoryRow(
  orgId: string,
  owner: string,
  name: string,
  branch: string,
  localPath: string,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("repositories")
    .upsert(
      {
        org_id: orgId,
        owner,
        name,
        default_branch: branch,
        local_path: localPath,
      },
      { onConflict: "org_id,owner,name,local_path" },
    )
    .select("id")
    .single();
  if (error || !data) {
    logFailure("repositories upsert", error);
    return null;
  }
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
  } catch (error) {
    logFailure("ensureWorkspaceAccess", error);
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

    const workspaceId = orgScopedWorkspaceId(
      orgId,
      input.backendId,
      input.localPath,
    );
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
      input.owner === "local" ? normalizeWorkspacePath(input.localPath) : "",
    );
    if (!repositoryUuid) return null;

    return { workspaceId, repositoryUuid };
  } catch (error) {
    logFailure("resolvePersistenceIds", error);
    return null;
  }
}
