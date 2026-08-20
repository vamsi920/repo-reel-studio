-- Companion table to the external Automation Server's own Automation record --
-- that server remains authoritative for the record itself; no FK is possible
-- since it's a different database. `automation_id` is the id it returns.
create table automation_metadata (
  automation_id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  proactivation_config jsonb,
  created_at timestamptz not null default now()
);

create table proactivation_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references workspaces(id) on delete cascade,
  automation_id text references automation_metadata(automation_id) on delete set null,
  watch_area text,
  title text,
  evidence jsonb,
  risk text,
  status text check (status in ('proposed', 'accepted', 'dismissed')),
  dismissed_reason text,
  created_at timestamptz not null default now()
);
create index proactivation_candidates_workspace_status_idx on proactivation_candidates(workspace_id, status);

-- Unifies AgentOps run cost, automation-run cost, memory-savings, and live
-- conversation cost into one pipeline instead of the 3-4 disconnected models
-- that exist today.
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  source text not null check (source in ('agentops', 'automation_run', 'memory_savings', 'conversation')),
  run_id text,
  automation_id text,
  cost_usd numeric,
  tokens jsonb,
  occurred_at timestamptz not null default now()
);
create index usage_events_workspace_occurred_idx on usage_events(workspace_id, occurred_at desc);
create index usage_events_source_idx on usage_events(source);

-- Refreshed by an Edge Function on a pg_cron trigger -- a real table, not a
-- live view, so it never repeats the legacy schema's `token_savings_daily`
-- mistake of being an apparent rollup that was actually manually maintained.
create table workspace_usage_daily (
  workspace_id text not null references workspaces(id) on delete cascade,
  day date not null,
  total_cost_usd numeric not null default 0,
  total_tokens bigint not null default 0,
  run_count integer not null default 0,
  primary key (workspace_id, day)
);

create table workspace_budgets (
  workspace_id text primary key references workspaces(id) on delete cascade,
  monthly_budget_usd numeric,
  warning_threshold_percent numeric,
  updated_at timestamptz not null default now()
);

-- Registry row per Storage object so listing/ownership checks don't require a
-- Storage API list call, and signed-URL issuance can check ownership first.
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  bucket text not null,
  path text not null,
  kind text,
  content_type text,
  size_bytes bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index artifacts_workspace_idx on artifacts(workspace_id);
