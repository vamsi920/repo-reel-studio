alter table repositories enable row level security;
alter table workspace_repositories enable row level security;

create policy "org members can read repositories"
  on repositories for select
  using (is_org_member(org_id));

create policy "org members can register a repository"
  on repositories for insert
  with check (is_org_member(org_id));

create policy "org admins can update repositories"
  on repositories for update
  using (has_org_role(org_id, 'admin'))
  with check (has_org_role(org_id, 'admin'));

create policy "workspace members can read repository links"
  on workspace_repositories for select
  using (is_workspace_member(workspace_id));

create policy "workspace members can link a repository"
  on workspace_repositories for insert
  with check (is_workspace_member(workspace_id));

create policy "workspace members can update repository links"
  on workspace_repositories for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "workspace members can unlink a repository"
  on workspace_repositories for delete
  using (is_workspace_member(workspace_id));
