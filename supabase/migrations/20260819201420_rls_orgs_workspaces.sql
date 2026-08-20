-- Membership graph tables. Deletion policies are deliberately omitted here
-- (RLS defaults to deny when enabled and no policy matches a command) --
-- destroying an org/workspace is a controlled operation for later admin
-- tooling (service role), not a normal member-facing action.

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;

create policy "members can read their orgs"
  on orgs for select
  using (is_org_member(id));

create policy "authenticated users can create an org"
  on orgs for insert
  with check (created_by = (select auth.uid()));

create policy "org admins can update their org"
  on orgs for update
  using (has_org_role(id, 'admin'))
  with check (has_org_role(id, 'admin'));

create policy "members can read their org membership"
  on org_members for select
  using (is_org_member(org_id));

create policy "creator can self-join their new org as owner"
  on org_members for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from orgs o where o.id = org_id and o.created_by = (select auth.uid()))
  );

create policy "org admins can add members"
  on org_members for insert
  with check (has_org_role(org_id, 'admin'));

create policy "org admins can change member roles"
  on org_members for update
  using (has_org_role(org_id, 'admin'))
  with check (has_org_role(org_id, 'admin'));

create policy "org admins can remove members"
  on org_members for delete
  using (has_org_role(org_id, 'admin'));

create policy "workspace members can read their workspace"
  on workspaces for select
  using (has_workspace_role(id, 'viewer'));

create policy "org members can create a workspace in their org"
  on workspaces for insert
  with check (is_org_member(org_id));

create policy "workspace admins can update their workspace"
  on workspaces for update
  using (has_workspace_role(id, 'admin'))
  with check (has_workspace_role(id, 'admin'));

create policy "workspace members can read membership"
  on workspace_members for select
  using (is_workspace_member(workspace_id));

create policy "org members can self-join a workspace in their org"
  on workspace_members for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from workspaces w where w.id = workspace_id and is_org_member(w.org_id))
  );

create policy "workspace admins can add members"
  on workspace_members for insert
  with check (has_workspace_role(workspace_id, 'admin'));

create policy "workspace admins can change member roles"
  on workspace_members for update
  using (has_workspace_role(workspace_id, 'admin'))
  with check (has_workspace_role(workspace_id, 'admin'));

create policy "workspace admins can remove members"
  on workspace_members for delete
  using (has_workspace_role(workspace_id, 'admin'));
