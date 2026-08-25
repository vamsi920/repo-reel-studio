-- Jira/Atlassian OAuth connections: same shape as github_connections
-- (20260824130000_github_connections.sql) -- one connection per user,
-- user-owned RLS (no membership-table recursion risk), tokens encrypted at
-- rest. Reuses `encrypt_github_token`/`decrypt_github_token` (plain
-- pgp_sym_encrypt/decrypt wrappers, nothing GitHub-specific despite the
-- name) rather than duplicating or renaming them -- avoids touching the
-- already-working GitHub Edge Functions that call them.

create table jira_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cloud_id text not null,
  site_url text not null,
  site_name text,
  atlassian_account_id text not null,
  atlassian_email text,
  encrypted_access_token bytea not null,
  -- Unlike GitHub's non-expiring tokens, Atlassian access tokens expire
  -- (~1hr) -- the refresh token is what keeps the browse UI working without
  -- forcing re-auth every hour.
  encrypted_refresh_token bytea,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table jira_connections enable row level security;

create policy "users read their own jira connection"
  on jira_connections for select
  using (user_id = (select auth.uid()));

-- No insert/update/delete policy for authenticated -- every write goes
-- through a service-role Edge Function (jira-oauth-callback, jira-disconnect,
-- jira-api-proxy's token-refresh path), same boundary as github_connections.

create table jira_oauth_state (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now()
);

alter table jira_oauth_state enable row level security;
-- No policies at all -- written and read only by service-role Edge
-- Functions (jira-oauth-start, jira-oauth-callback).
