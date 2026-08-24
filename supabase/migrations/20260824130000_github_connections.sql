-- GitHub OAuth connections: one connection per user, token encrypted at rest
-- via pgcrypto. This table is user-owned (not org/workspace-scoped), so RLS
-- can reference auth.uid() directly -- no membership-table recursion risk,
-- unlike the org/workspace helper functions in rls_helper_functions.sql.

create extension if not exists pgcrypto;

create table github_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  github_user_id bigint not null,
  github_username text not null,
  enterprise_host text, -- null = github.com / api.github.com
  encrypted_access_token bytea not null, -- pgp_sym_encrypt(token, key)
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table github_connections enable row level security;

create policy "users read their own github connection"
  on github_connections for select
  using (user_id = (select auth.uid()));

-- Deliberately no insert/update/delete policy for authenticated -- every
-- write goes through a service-role Edge Function (github-oauth-callback,
-- github-disconnect), which bypasses RLS entirely. This is stricter than
-- the `USING (true)` mistake documented in docs/supabase-current-state.md
-- for the legacy app's project_env_overrides table.

-- Short-lived OAuth state (PKCE) -- exists before a user session's identity
-- is confirmed by GitHub, single-use, and needs a TTL, so it's a separate
-- table rather than folded into github_connections.
create table github_oauth_state (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  enterprise_host text,
  code_verifier text not null,
  created_at timestamptz not null default now()
);

alter table github_oauth_state enable row level security;
-- No policies for authenticated/anon at all: written and read only by
-- service-role Edge Functions (github-oauth-start, github-oauth-callback).

-- Encrypt/decrypt helpers. The key is passed as a parameter (supplied by the
-- calling Edge Function from its own env var) rather than a custom GUC, to
-- avoid a separate `ALTER DATABASE ... SET app.settings.*` provisioning
-- step. Safe because these functions are revoked from public/authenticated
-- below -- only the service_role connection Edge Functions use can call
-- them, and service_role bypasses grants entirely, so this revoke is the
-- actual security boundary, not the parameter shape.
create or replace function encrypt_github_token(token text, encryption_key text)
returns bytea
language sql
security definer
set search_path = public, extensions
as $$
  select pgp_sym_encrypt(token, encryption_key);
$$;

create or replace function decrypt_github_token(ciphertext bytea, encryption_key text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select pgp_sym_decrypt(ciphertext, encryption_key);
$$;

revoke execute on function encrypt_github_token(text, text) from public;
revoke execute on function decrypt_github_token(bytea, text) from public;
-- Intentionally no grant back to `authenticated` -- unlike the RLS helper
-- functions (which authenticated must call during policy evaluation), these
-- encrypt/decrypt the actual token and must only ever run as service_role
-- from within an Edge Function.
