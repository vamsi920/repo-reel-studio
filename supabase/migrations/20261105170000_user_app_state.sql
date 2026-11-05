-- Per-user copy of the app state the browser keeps in localStorage (studio
-- projects, conversation metadata, pinned/archived chats, recent repos), so it
-- follows the signed-in user across browsers, localhost and production.
create table if not exists public.user_app_state (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_app_state enable row level security;

drop policy if exists user_app_state_own on public.user_app_state;
create policy user_app_state_own on public.user_app_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
