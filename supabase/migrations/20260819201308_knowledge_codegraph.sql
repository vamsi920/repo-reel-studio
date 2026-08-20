-- Normalized DeepWiki output (src/lib/knowledge/knowledge-engine.ts types),
-- keyed to an immutable (repository_id, commit_sha) pair. Large rendered
-- artifacts (exported diagrams/images) live in Storage, referenced from
-- `artifacts`, not embedded here.

create table knowledge_generations (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid references repositories(id) on delete cascade,
  workspace_id text references workspaces(id) on delete cascade,
  commit_sha text not null,
  title text,
  summary text,
  generated_at timestamptz not null default now(),
  unique (repository_id, commit_sha)
);

create table knowledge_sections (
  generation_id uuid not null references knowledge_generations(id) on delete cascade,
  id text not null,
  title text,
  description text,
  page_ids text[] not null default '{}',
  primary key (generation_id, id)
);

create table knowledge_pages (
  generation_id uuid not null references knowledge_generations(id) on delete cascade,
  id text not null,
  title text,
  description text,
  content_markdown text,
  importance text,
  relevant_files jsonb not null default '[]'::jsonb,
  related_page_ids text[] not null default '{}',
  parent_section_id text,
  primary key (generation_id, id)
);

create table knowledge_diagrams (
  page_generation_id uuid not null references knowledge_generations(id) on delete cascade,
  id text not null,
  type text,
  mermaid text,
  primary key (page_generation_id, id)
);

-- CodeGraph snapshot metadata only -- the actual node/edge payload stays in
-- the existing sharded workspace-file format at
-- .neodevex/codegraph/out/<commitSha>/{meta.json,levels/*.json,search.json};
-- it never moves to Postgres. `output_path` cross-references that location.
create table codegraph_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references workspaces(id) on delete cascade,
  repository_id uuid references repositories(id) on delete cascade,
  commit_sha text not null,
  node_count integer,
  edge_count integer,
  analyzer_version text,
  generated_at timestamptz not null default now(),
  output_path text,
  unique (workspace_id, repository_id, commit_sha)
);
