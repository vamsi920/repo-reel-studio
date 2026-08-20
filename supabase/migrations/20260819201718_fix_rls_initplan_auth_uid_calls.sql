-- Wrap auth.uid() as (select auth.uid()) in the bootstrap self-join policies
-- so Postgres evaluates it once per statement instead of once per row.

drop policy "authenticated users can create an org" on orgs;
create policy "authenticated users can create an org"
  on orgs for insert
  with check (created_by = (select auth.uid()));

drop policy "creator can self-join their new org as owner" on org_members;
create policy "creator can self-join their new org as owner"
  on org_members for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from orgs o where o.id = org_id and o.created_by = (select auth.uid()))
  );

drop policy "org members can self-join a workspace in their org" on workspace_members;
create policy "org members can self-join a workspace in their org"
  on workspace_members for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from workspaces w where w.id = workspace_id and is_org_member(w.org_id))
  );
