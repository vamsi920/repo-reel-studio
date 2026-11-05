-- Every chat a user runs, on any agent-server (their laptop, production),
-- indexed and archived per user so the sidebar and transcript are the same
-- everywhere. The agent-server that ran a chat stays its source of truth;
-- this is the copy other environments read.
create table if not exists public.conversation_index (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id text not null,
  origin text not null,
  title text,
  selected_repository text,
  selected_branch text,
  execution_status text,
  created_at timestamptz,
  updated_at timestamptz,
  info jsonb not null default '{}'::jsonb,
  archived_through timestamptz,
  indexed_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists conversation_index_recent
  on public.conversation_index (user_id, updated_at desc);

create table if not exists public.conversation_events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id text not null,
  event_id text not null,
  ts timestamptz not null,
  payload jsonb not null,
  primary key (user_id, conversation_id, event_id)
);

create index if not exists conversation_events_by_time
  on public.conversation_events (user_id, conversation_id, ts);

alter table public.conversation_index enable row level security;
alter table public.conversation_events enable row level security;

drop policy if exists conversation_index_own on public.conversation_index;
create policy conversation_index_own on public.conversation_index
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists conversation_events_own on public.conversation_events;
create policy conversation_events_own on public.conversation_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
