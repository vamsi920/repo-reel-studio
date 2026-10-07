-- Connection activity log: who connected, disconnected or renewed which
-- provider, and when a connection's health changed. Only real changes are
-- written (a status is logged when it differs from the previous one), so an
-- hourly sweep that finds nothing new adds nothing here.
--
-- Holds no credentials. Written only by service-role Edge Functions, so the
-- history cannot be forged from a browser; readable by org members.
create table if not exists connection_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  provider_id text not null,
  instance_key text not null default 'default',
  action text not null
    check (action in ('connected', 'disconnected', 'refreshed', 'status_changed')),
  status text,
  actor uuid references auth.users (id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists connection_events_org_created_idx
  on connection_events (org_id, created_at desc);

alter table connection_events enable row level security;

create policy "org members read connection events"
  on connection_events for select
  using (is_org_member(org_id));
