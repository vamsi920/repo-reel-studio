create table activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  actor text not null check (actor in ('user', 'agent', 'system')),
  kind text not null,
  summary text not null,
  message text,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index activity_events_workspace_at_idx on activity_events(workspace_id, at desc);

-- Realtime: workspace-scoped activity feed. RLS on the underlying table (added
-- in the RLS migration) is what actually gates who receives broadcasts.
alter publication supabase_realtime add table activity_events;
