-- Automation definitions from every agent-server a user runs, so each
-- environment can see (and copy) the others'. An automation still runs only
-- on the server it lives on: running the same one in two places would fire
-- twice for one GitHub event.
create table if not exists public.automation_index (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  origin text not null,
  automation_id text not null,
  name text not null,
  enabled boolean not null default false,
  trigger jsonb,
  spec jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, origin, automation_id)
);

alter table public.automation_index enable row level security;

drop policy if exists automation_index_own on public.automation_index;
create policy automation_index_own on public.automation_index
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
