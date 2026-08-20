-- Relational mirror of scripts/agentops/store.mjs's JSONL shapes
-- (runs.jsonl, spans/<runId>.jsonl, audit.jsonl, approvals.jsonl, policies.json).
-- The JSONL files remain the primary, tamper-evident, zero-setup audit trail;
-- these tables are an additive durable/cross-device sink written best-effort
-- by the AgentOps sidecar (scripts/agentops-server.mjs), never the other way
-- around. workspace_id is nullable: the collector's raw AgentOpsRun.workspaceId
-- is the agent-server's `working_dir`, and bridging that to the
-- computeWorkspaceId() hash format needs the collector to also know the
-- frontend's backendId, which is an open item for the PR that wires this up.

create table agentops_runs (
  run_id text primary key,
  workspace_id text references workspaces(id) on delete set null,
  agent_name text,
  task text,
  status text,
  model text,
  phase text,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  cost_usd numeric not null default 0,
  max_budget_per_task numeric,
  tokens jsonb not null default '{}'::jsonb,
  tool_call_count integer not null default 0,
  llm_call_count integer not null default 0,
  error_count integer not null default 0,
  artifacts text[] not null default '{}'
);
create index agentops_runs_workspace_updated_idx on agentops_runs(workspace_id, updated_at desc);
create index agentops_runs_status_idx on agentops_runs(status);

create table agentops_spans (
  span_id text primary key,
  run_id text not null references agentops_runs(run_id) on delete cascade,
  parent_span_id text,
  trace_id text,
  kind text,
  name text,
  phase text,
  status text,
  start_time timestamptz,
  end_time timestamptz,
  -- Reasoning/thinking content is already stripped by
  -- scripts/agentops/map-events.mjs before a span ever exists; this table
  -- inherits that invariant rather than re-enforcing it.
  attributes jsonb not null default '{}'::jsonb
);
create index agentops_spans_run_start_idx on agentops_spans(run_id, start_time);

create table agentops_audit (
  id text primary key,
  at timestamptz not null default now(),
  actor text,
  action text,
  summary text,
  entity_type text,
  entity_id text,
  workspace_id text references workspaces(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);
create index agentops_audit_workspace_at_idx on agentops_audit(workspace_id, at desc);
create index agentops_audit_entity_idx on agentops_audit(entity_id);

create table agentops_approvals (
  id text primary key,
  kind text check (kind in ('confirmation', 'budget')),
  state text check (state in ('pending', 'approved', 'rejected')),
  run_id text references agentops_runs(run_id) on delete set null,
  workspace_id text references workspaces(id) on delete set null,
  agent_name text,
  title text,
  what jsonb,
  why text,
  tool_name text,
  security_risk text,
  artifacts text[] not null default '{}',
  estimated_cost_usd numeric,
  autonomy_level text,
  breaches jsonb not null default '[]'::jsonb,
  requested_at timestamptz,
  decided_at timestamptz,
  decision_reason text
);
create index agentops_approvals_workspace_state_idx on agentops_approvals(workspace_id, state);

create table agentops_policies (
  workspace_id text primary key references workspaces(id) on delete cascade,
  policy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table agentops_agent_budgets (
  org_id uuid not null references orgs(id) on delete cascade,
  agent_name text not null,
  agent_budget_usd numeric,
  primary key (org_id, agent_name)
);
