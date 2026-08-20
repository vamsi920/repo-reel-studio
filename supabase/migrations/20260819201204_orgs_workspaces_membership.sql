-- Organizations, workspaces, and membership. `workspaces.id` deliberately uses
-- the client-computed `ws_<hex><hex>` string produced by
-- src/lib/workspace-memory/workspace-id.ts (computeWorkspaceId), not a fresh
-- uuid, so every workspace-scoped write from the browser is a direct joinless
-- insert keyed by a value already held synchronously.

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_id_idx on org_members(user_id);

create table workspaces (
  id text primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  backend_id text not null,
  path text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_org_id_idx on workspaces(org_id);

create table workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on workspace_members(user_id);
