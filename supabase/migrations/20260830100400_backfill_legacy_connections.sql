-- Backfills github_connections and jira_connections into the generic
-- `connections` table.
--
-- The awkward part is scope: the legacy tables are keyed by user_id, the new
-- one by org_id. A user who belongs to more than one org is genuinely
-- ambiguous -- there is no fact in the old row that says which org the
-- connection was for. This picks their oldest org (which is the personal org
-- created by ensurePersonalOrg for anyone who has not been invited elsewhere,
-- so it is right for the overwhelmingly common case) and records the
-- ambiguity rather than guessing silently.
--
-- Nothing is deleted or altered here. The old tables keep their rows and the
-- existing Edge Functions keep reading them; this only makes the same
-- connections visible through the new surface. Retiring the legacy tables is
-- a separate, later change, after the dual-write window has proved itself.

create table if not exists connections_backfill_notes (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  user_id uuid not null,
  chosen_org_id uuid,
  org_count integer not null,
  note text not null,
  created_at timestamptz not null default now()
);

-- Operator-facing only; no client ever reads it.
alter table connections_backfill_notes enable row level security;

with primary_org as (
  select distinct on (user_id) user_id, org_id
  from org_members
  order by user_id, created_at asc
),
org_counts as (
  select user_id, count(*)::int as org_count from org_members group by user_id
)
insert into connections_backfill_notes (source_table, user_id, chosen_org_id, org_count, note)
select
  src.source_table,
  src.user_id,
  primary_org.org_id,
  coalesce(org_counts.org_count, 0),
  case
    when primary_org.org_id is null
      then 'skipped: user has no org membership'
    when coalesce(org_counts.org_count, 0) > 1
      then 'ambiguous: user belongs to several orgs; oldest chosen'
    else 'ok'
  end
from (
  select 'github_connections' as source_table, user_id from github_connections
  union all
  select 'jira_connections', user_id from jira_connections
) src
left join primary_org on primary_org.user_id = src.user_id
left join org_counts on org_counts.user_id = src.user_id;

-- GitHub. `enterprise_host` decides which manifest the row belongs to: a GHES
-- instance is a different OAuth issuer with its own application, so it is a
-- different provider, not the same one with a setting.
with primary_org as (
  select distinct on (user_id) user_id, org_id
  from org_members
  order by user_id, created_at asc
)
insert into connections (
  org_id, capability, provider_id, instance_key, display_name,
  config, encrypted_credentials, redacted_summary,
  granted_scopes, requested_scopes, status, created_by, created_at, updated_at
)
select
  primary_org.org_id,
  'source-control',
  case when gc.enterprise_host is null then 'github' else 'github-enterprise' end,
  'default',
  gc.github_username,
  case
    when gc.enterprise_host is null then '{}'::jsonb
    else jsonb_build_object('enterpriseHost', gc.enterprise_host)
  end,
  gc.encrypted_access_token,
  jsonb_build_object('account', gc.github_username),
  gc.scopes,
  gc.scopes,
  'unverified',
  gc.user_id,
  gc.connected_at,
  gc.updated_at
from github_connections gc
join primary_org on primary_org.user_id = gc.user_id
on conflict (org_id, capability, provider_id, instance_key) do nothing;

-- Jira. Only the refresh token is carried over: the access token lasts about
-- an hour, so copying it would import something already stale, and the proxy
-- refreshes on first use anyway.
with primary_org as (
  select distinct on (user_id) user_id, org_id
  from org_members
  order by user_id, created_at asc
)
insert into connections (
  org_id, capability, provider_id, instance_key, display_name,
  config, encrypted_credentials, redacted_summary,
  granted_scopes, requested_scopes, status, created_by, created_at, updated_at
)
select
  primary_org.org_id,
  'issue-tracker',
  'jira-cloud',
  'default',
  jc.site_url,
  jsonb_build_object('cloudId', jc.cloud_id, 'siteUrl', jc.site_url),
  jc.encrypted_refresh_token,
  jsonb_build_object('site', jc.site_url),
  jc.scopes,
  jc.scopes,
  'unverified',
  jc.user_id,
  jc.connected_at,
  jc.updated_at
from jira_connections jc
join primary_org on primary_org.user_id = jc.user_id
on conflict (org_id, capability, provider_id, instance_key) do nothing;
