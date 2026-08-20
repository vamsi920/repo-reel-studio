-- Repository metadata only -- never a git checkout. Execution/checkouts stay
-- in the agent runtime/sandbox infrastructure outside this repo.

create table repositories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  provider text not null default 'github',
  owner text not null,
  name text not null,
  default_branch text,
  external_id text,
  connection_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, owner, name)
);

create table workspace_repositories (
  workspace_id text not null references workspaces(id) on delete cascade,
  repository_id uuid not null references repositories(id) on delete cascade,
  commit_sha text,
  linked_at timestamptz not null default now(),
  primary key (workspace_id, repository_id)
);
create index workspace_repositories_repository_id_idx on workspace_repositories(repository_id);
