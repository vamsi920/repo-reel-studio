-- Mirrors src/lib/workspace-memory/types.ts MemoryRecord field-for-field so
-- the repository mapping layer is a straight passthrough, not a transform.
-- `id` is text (not uuid) because MemoryRecord.id is already generated
-- client-side as a string -- storing as uuid would risk a format mismatch.

create table memory_records (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null,
  subject text not null,
  statement text not null,
  tags text[] not null default '{}',
  provenance jsonb not null default '{}'::jsonb,
  status text not null check (status in ('active', 'superseded', 'conflicted')),
  confidence numeric,
  pinned boolean not null default false,
  created_at timestamptz not null,
  superseded_at timestamptz,
  superseded_by_id text,
  conflicts_with text[] not null default '{}',
  token_cost integer,
  synced_at timestamptz not null default now()
);
create index memory_records_workspace_status_idx on memory_records(workspace_id, status);
create index memory_records_workspace_subject_idx on memory_records(workspace_id, subject);

-- Embeddings are a separate table from the record write so a missing/slow
-- embedder never blocks the record write itself (the record write happens
-- from the browser sync leg; the embedding is populated later by an Edge
-- Function). workspace_id is denormalized on purpose -- it lets RLS and the
-- similarity-search RPC filter without a join back to memory_records.
create table memory_embeddings (
  record_id text primary key references memory_records(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  embedding extensions.vector(1536) not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index memory_embeddings_workspace_idx on memory_embeddings(workspace_id);
create index memory_embeddings_embedding_idx on memory_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);
