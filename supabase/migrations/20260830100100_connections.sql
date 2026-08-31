-- One table for every connector, replacing the per-vendor pattern of
-- github_connections + jira_connections. `provider_id` discriminates; the
-- shape of what a provider needs lives in the connector registry
-- (src/lib/environment/registry, mirrored into the Edge Functions), not in
-- the schema, so adding Pinecone or GitLab needs no migration.
--
-- Org-scoped rather than user-scoped. The legacy tables key on user_id, which
-- meant a colleague could not see or use a connection their teammate made --
-- fine for one person evaluating the product, wrong for a company onboarding
-- it. The backfill in the companion migration maps user -> org.

create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  capability text not null,
  provider_id text not null,
  -- Distinguishes two GitHub orgs, or prod vs staging Pinecone, without a
  -- second table. 'default' for the common single-instance case.
  instance_key text not null default 'default',
  display_name text,

  -- Non-secret settings only: hosts, regions, index names. Readable by any
  -- org member and shown to the onboarding agent.
  config jsonb not null default '{}'::jsonb,

  -- pgp_sym_encrypt of a JSON object keyed by the manifest's secret fields.
  encrypted_credentials bytea,
  -- Reference into an external secret manager, for deployments that refuse to
  -- let the platform hold the material at all. Unused today; the column
  -- exists now so adopting a customer's Vault is additive rather than a
  -- migration of live credential rows.
  credential_ref jsonb,
  -- sha256 prefix of the secret. Detects rotation and cross-environment
  -- reuse without ever revealing the value.
  credential_fingerprint text,
  -- Masked per-field summary, computed server-side. This is the only
  -- credential-shaped thing the UI or the agent ever sees.
  redacted_summary jsonb not null default '{}'::jsonb,

  requested_scopes text[] not null default '{}',
  granted_scopes text[] not null default '{}',

  status text not null default 'unverified'
    check (status in ('unverified', 'ok', 'degraded', 'error', 'expired', 'revoked')),
  last_probe jsonb,
  last_probe_at timestamptz,
  -- OAuth access-token expiry, for the rotation warning on the overview tile.
  expires_at timestamptz,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_id, capability, provider_id, instance_key)
);

create index if not exists connections_org_capability_idx
  on connections (org_id, capability);
-- Partial: only rows that can expire are of interest to the refresh sweep.
create index if not exists connections_expiring_idx
  on connections (expires_at)
  where expires_at is not null;

alter table connections enable row level security;

create policy "org members read connections"
  on connections for select
  using (is_org_member(org_id));

-- Deliberately no insert/update/delete policy: every write goes through a
-- service-role Edge Function, following the github_connections precedent.

-- RLS filters rows, not columns -- `select *` from an org member would
-- otherwise hand out the ciphertext and the fingerprint for offline attack.
-- Column privileges are the only mechanism that closes this.
revoke select (encrypted_credentials, credential_fingerprint, credential_ref)
  on connections from anon, authenticated;

-- Short-lived OAuth state. Separate from `connections` because it exists
-- before the provider has confirmed anything, is single-use, and needs a TTL.
create table if not exists oauth_states (
  state text primary key,
  org_id uuid not null references orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  capability text not null,
  provider_id text not null,
  instance_key text not null default 'default',
  code_verifier text not null,
  -- Configuration chosen before the redirect (an enterprise host, say) that
  -- the callback needs but the provider will not echo back.
  config jsonb not null default '{}'::jsonb,
  return_to text,
  created_at timestamptz not null default now()
);

alter table oauth_states enable row level security;
-- No policies at all: written and read only by service-role Edge Functions.
