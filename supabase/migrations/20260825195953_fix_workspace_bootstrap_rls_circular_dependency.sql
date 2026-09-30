-- Repairs schema drift: applied directly to the live NeoDevex project on
-- 2026-08-25 (confirmed via `supabase list_migrations`, version
-- 20260825195953) but never committed here.
--
-- Same shape as 20260825195855 (fix_org_bootstrap_rls_circular_dependency),
-- one level down: `ensureWorkspaceMembership`
-- (src/lib/data-platform/repositories/repository-identity.ts) upserts a
-- `workspaces` row and then needs to read it back before the
-- `workspace_members` self-join row exists. The original "workspace members
-- can read their workspace" policy (`has_workspace_role(id, 'viewer')`
-- only) can't be satisfied yet at that point. Widen the SELECT policy to
-- also allow any member of the workspace's owning org, closing the
-- bootstrap-order circular dependency.

drop policy "workspace members can read their workspace" on workspaces;

create policy "workspace members can read their workspace"
  on workspaces for select
  using (has_workspace_role(id, 'viewer') or is_org_member(org_id));
