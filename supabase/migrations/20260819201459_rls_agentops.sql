-- Writes to these tables come from the AgentOps sidecar (scripts/agentops-server.mjs)
-- using the service-role key, which bypasses RLS entirely -- these policies
-- only govern what workspace members can READ. A run/audit/approval row with
-- a null workspace_id (not yet bridged to a computeWorkspaceId() hash, see
-- the agentops migration's comment) is invisible to regular members by
-- design until that bridging lands; only the service role can see it.

alter table agentops_runs enable row level security;
alter table agentops_spans enable row level security;
alter table agentops_audit enable row level security;
alter table agentops_approvals enable row level security;
alter table agentops_policies enable row level security;
alter table agentops_agent_budgets enable row level security;

create policy "members can read workspace agentops runs"
  on agentops_runs for select
  using (is_workspace_member(workspace_id));

create policy "members can read workspace agentops spans"
  on agentops_spans for select
  using (
    exists (
      select 1 from agentops_runs r
      where r.run_id = agentops_spans.run_id and is_workspace_member(r.workspace_id)
    )
  );

create policy "members can read workspace agentops audit"
  on agentops_audit for select
  using (is_workspace_member(workspace_id));

create policy "members can read workspace agentops approvals"
  on agentops_approvals for select
  using (is_workspace_member(workspace_id));

create policy "members can read workspace agentops policies"
  on agentops_policies for select
  using (has_workspace_role(workspace_id, 'viewer'));

create policy "workspace admins can write agentops policies"
  on agentops_policies for insert
  with check (has_workspace_role(workspace_id, 'admin'));

create policy "workspace admins can update agentops policies"
  on agentops_policies for update
  using (has_workspace_role(workspace_id, 'admin'))
  with check (has_workspace_role(workspace_id, 'admin'));

create policy "org members can read agent budgets"
  on agentops_agent_budgets for select
  using (has_org_role(org_id, 'member'));

create policy "org admins can write agent budgets"
  on agentops_agent_budgets for insert
  with check (has_org_role(org_id, 'admin'));

create policy "org admins can update agent budgets"
  on agentops_agent_budgets for update
  using (has_org_role(org_id, 'admin'))
  with check (has_org_role(org_id, 'admin'));
