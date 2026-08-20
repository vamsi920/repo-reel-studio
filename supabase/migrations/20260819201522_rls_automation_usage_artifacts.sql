alter table automation_metadata enable row level security;
alter table proactivation_candidates enable row level security;
alter table usage_events enable row level security;
alter table workspace_usage_daily enable row level security;
alter table workspace_budgets enable row level security;
alter table artifacts enable row level security;

create policy "members can read automation metadata"
  on automation_metadata for select
  using (is_workspace_member(workspace_id));

create policy "members can write automation metadata"
  on automation_metadata for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update automation metadata"
  on automation_metadata for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can read proactivation candidates"
  on proactivation_candidates for select
  using (is_workspace_member(workspace_id));

create policy "members can write proactivation candidates"
  on proactivation_candidates for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update proactivation candidates"
  on proactivation_candidates for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- usage_events is populated by trusted writers (AgentOps sidecar, Edge
-- Functions) using the service role, which bypasses RLS -- members get a
-- read-only policy so the Usage dashboard can query it directly.
create policy "members can read workspace usage events"
  on usage_events for select
  using (is_workspace_member(workspace_id));

create policy "members can read workspace usage rollups"
  on workspace_usage_daily for select
  using (is_workspace_member(workspace_id));

create policy "members can read workspace budget"
  on workspace_budgets for select
  using (has_workspace_role(workspace_id, 'viewer'));

create policy "workspace admins can write budget"
  on workspace_budgets for insert
  with check (has_workspace_role(workspace_id, 'admin'));

create policy "workspace admins can update budget"
  on workspace_budgets for update
  using (has_workspace_role(workspace_id, 'admin'))
  with check (has_workspace_role(workspace_id, 'admin'));

create policy "members can read workspace artifacts registry"
  on artifacts for select
  using (is_workspace_member(workspace_id));

create policy "members can register workspace artifacts"
  on artifacts for insert
  with check (is_workspace_member(workspace_id));

create policy "members can delete workspace artifacts registry rows"
  on artifacts for delete
  using (is_workspace_member(workspace_id));
