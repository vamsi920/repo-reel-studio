-- Encrypted per-user state (LLM profiles with API keys) that follows the
-- user across environments. Written and read only by the user-vault edge
-- function with the service role: no client policy on purpose.
create table if not exists public.user_secret_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  ciphertext bytea not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_secret_state enable row level security;
