-- Neo RAG: retrieval as a platform service (specs/neo-rag.md).
--
-- A team (org) owns collections; a collection holds sources (files, text,
-- URLs, repositories, KT docs, workspace memory); a source holds documents;
-- a document is cut into chunks, each with an embedding (pgvector, HNSW
-- cosine) and a full-text vector (tsvector, GIN). Hybrid search fuses both
-- ranked lists with Reciprocal Rank Fusion inside one SQL function.
--
-- Who writes what:
-- - The browser reads collections/sources/documents/eval rows and creates or
--   deletes collections, sources and eval cases under RLS (team members;
--   viewers read only).
-- - Chunks, embeddings, API keys and query logs are written only by the `rag`
--   Edge Function with the service role, after it has checked the caller's
--   team role itself. There are no browser policies on those tables except
--   read access to chunks for the inspector.
-- - `rag_hybrid_search` is executable by the service role only: tenancy is
--   decided before it is called, and the function filters by the collection
--   ids it is given.

create extension if not exists vector with schema extensions;

create table if not exists rag_collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rag_collections_org_idx on rag_collections(org_id);

create table if not exists rag_sources (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references rag_collections(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null check (kind in ('upload', 'text', 'url', 'github', 'kt', 'memory')),
  name text not null check (char_length(name) between 1 and 300),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'syncing', 'ready', 'error')),
  error text,
  document_count integer not null default 0,
  chunk_count integer not null default 0,
  last_synced_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists rag_sources_collection_idx on rag_sources(collection_id);

create table if not exists rag_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references rag_sources(id) on delete cascade,
  collection_id uuid not null references rag_collections(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  external_id text not null,
  title text not null,
  uri text,
  mime text,
  version_hash text not null,
  token_count integer not null default 0,
  chunk_count integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists rag_documents_collection_idx on rag_documents(collection_id);

create table if not exists rag_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references rag_documents(id) on delete cascade,
  source_id uuid not null references rag_sources(id) on delete cascade,
  collection_id uuid not null references rag_collections(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  ordinal integer not null,
  content text not null,
  heading_path text not null default '',
  tokens integer not null default 0,
  embedding extensions.vector(1536),
  embed_model text,
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(heading_path, '')), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  unique (document_id, ordinal)
);
create index if not exists rag_chunks_collection_idx on rag_chunks(collection_id);
create index if not exists rag_chunks_tsv_idx on rag_chunks using gin (tsv);
create index if not exists rag_chunks_embedding_idx on rag_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists rag_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  prefix text not null,
  key_hash text not null unique,
  collection_ids uuid[],
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists rag_api_keys_org_idx on rag_api_keys(org_id);

create table if not exists rag_queries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  collection_ids uuid[] not null,
  actor text not null,
  channel text not null check (channel in ('app', 'api', 'mcp')),
  mode text not null check (mode in ('search', 'answer')),
  query_hash text not null,
  query_chars integer not null,
  result_count integer not null,
  top_chunk_ids uuid[] not null default '{}',
  latency_ms integer not null,
  timings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rag_queries_org_created_idx on rag_queries(org_id, created_at desc);

create table if not exists rag_eval_cases (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references rag_collections(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  question text not null check (char_length(question) between 3 and 1000),
  expected text not null check (char_length(expected) between 1 and 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists rag_eval_cases_collection_idx on rag_eval_cases(collection_id);

create table if not exists rag_eval_runs (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references rag_collections(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  metrics jsonb not null,
  cases jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists rag_eval_runs_collection_idx on rag_eval_runs(collection_id, created_at desc);

-- A child row's org must be its collection's org, so a member of team A can
-- never file a source under team B's collection by forging org_id.
create or replace function rag_child_org_matches()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner uuid;
begin
  select org_id into owner from rag_collections where id = new.collection_id;
  if owner is null or owner <> new.org_id then
    raise exception 'rag_org_mismatch' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists rag_sources_org_matches on rag_sources;
create trigger rag_sources_org_matches before insert or update on rag_sources
  for each row execute function rag_child_org_matches();
drop trigger if exists rag_eval_cases_org_matches on rag_eval_cases;
create trigger rag_eval_cases_org_matches before insert or update on rag_eval_cases
  for each row execute function rag_child_org_matches();

alter table rag_collections enable row level security;
alter table rag_sources enable row level security;
alter table rag_documents enable row level security;
alter table rag_chunks enable row level security;
alter table rag_api_keys enable row level security;
alter table rag_queries enable row level security;
alter table rag_eval_cases enable row level security;
alter table rag_eval_runs enable row level security;

drop policy if exists rag_collections_read on rag_collections;
create policy rag_collections_read on rag_collections for select
  using (has_org_role(org_id, 'viewer'));
drop policy if exists rag_collections_insert on rag_collections;
create policy rag_collections_insert on rag_collections for insert
  with check (has_org_role(org_id, 'member'));
drop policy if exists rag_collections_update on rag_collections;
create policy rag_collections_update on rag_collections for update
  using (has_org_role(org_id, 'member')) with check (has_org_role(org_id, 'member'));
drop policy if exists rag_collections_delete on rag_collections;
create policy rag_collections_delete on rag_collections for delete
  using (has_org_role(org_id, 'member'));

drop policy if exists rag_sources_read on rag_sources;
create policy rag_sources_read on rag_sources for select
  using (has_org_role(org_id, 'viewer'));
drop policy if exists rag_sources_insert on rag_sources;
create policy rag_sources_insert on rag_sources for insert
  with check (has_org_role(org_id, 'member'));
drop policy if exists rag_sources_update on rag_sources;
create policy rag_sources_update on rag_sources for update
  using (has_org_role(org_id, 'member')) with check (has_org_role(org_id, 'member'));
drop policy if exists rag_sources_delete on rag_sources;
create policy rag_sources_delete on rag_sources for delete
  using (has_org_role(org_id, 'member'));

drop policy if exists rag_documents_read on rag_documents;
create policy rag_documents_read on rag_documents for select
  using (has_org_role(org_id, 'viewer'));
drop policy if exists rag_documents_delete on rag_documents;
create policy rag_documents_delete on rag_documents for delete
  using (has_org_role(org_id, 'member'));

drop policy if exists rag_chunks_read on rag_chunks;
create policy rag_chunks_read on rag_chunks for select
  using (has_org_role(org_id, 'viewer'));

drop policy if exists rag_queries_read on rag_queries;
create policy rag_queries_read on rag_queries for select
  using (has_org_role(org_id, 'viewer'));

drop policy if exists rag_eval_cases_read on rag_eval_cases;
create policy rag_eval_cases_read on rag_eval_cases for select
  using (has_org_role(org_id, 'viewer'));
drop policy if exists rag_eval_cases_insert on rag_eval_cases;
create policy rag_eval_cases_insert on rag_eval_cases for insert
  with check (has_org_role(org_id, 'member'));
drop policy if exists rag_eval_cases_delete on rag_eval_cases;
create policy rag_eval_cases_delete on rag_eval_cases for delete
  using (has_org_role(org_id, 'member'));

drop policy if exists rag_eval_runs_read on rag_eval_runs;
create policy rag_eval_runs_read on rag_eval_runs for select
  using (has_org_role(org_id, 'viewer'));
drop policy if exists rag_eval_runs_insert on rag_eval_runs;
create policy rag_eval_runs_insert on rag_eval_runs for insert
  with check (has_org_role(org_id, 'member'));

-- rag_api_keys: no browser policies at all (key hashes never leave the
-- Edge Function).

-- Hybrid retrieval. Vector candidates by cosine distance and keyword
-- candidates by ts_rank_cd over an OR-query of the question's words, fused
-- with RRF (k = 60). Returns each chunk once with both ranks so the caller
-- can show why it was retrieved.
create or replace function rag_hybrid_search(
  p_collection_ids uuid[],
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_match_count integer default 8,
  p_candidates integer default 40
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_id uuid,
  collection_id uuid,
  ordinal integer,
  content text,
  heading_path text,
  tokens integer,
  title text,
  uri text,
  source_kind text,
  source_name text,
  vector_rank integer,
  text_rank integer,
  vector_similarity double precision,
  score double precision
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  q tsquery;
begin
  perform set_config('hnsw.ef_search', greatest(p_candidates * 2, 80)::text, true);
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  begin
    q := nullif(replace(plainto_tsquery('english', coalesce(p_query_text, ''))::text, '&', '|'), '')::tsquery;
  exception when others then
    q := null;
  end;

  return query
  with v as (
    select c.id, row_number() over (order by c.embedding <=> p_query_embedding)::integer as r,
           (1 - (c.embedding <=> p_query_embedding))::double precision as sim
    from rag_chunks c
    where c.collection_id = any(p_collection_ids)
      and c.embedding is not null
      and p_query_embedding is not null
    order by c.embedding <=> p_query_embedding
    limit p_candidates
  ),
  t as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, q) desc)::integer as r
    from rag_chunks c
    where q is not null
      and c.collection_id = any(p_collection_ids)
      and c.tsv @@ q
    order by ts_rank_cd(c.tsv, q) desc
    limit p_candidates
  ),
  fused as (
    select coalesce(v.id, t.id) as id, v.r as vr, t.r as tr, v.sim,
           (coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + t.r), 0))::double precision as s
    from v full outer join t on v.id = t.id
  )
  select c.id, c.document_id, c.source_id, c.collection_id, c.ordinal, c.content,
         c.heading_path, c.tokens, d.title, d.uri, s.kind, s.name,
         f.vr, f.tr, f.sim, f.s
  from fused f
  join rag_chunks c on c.id = f.id
  join rag_documents d on d.id = c.document_id
  join rag_sources s on s.id = c.source_id
  order by f.s desc
  limit p_match_count;
end;
$$;

revoke all on function rag_hybrid_search(uuid[], extensions.vector, text, integer, integer) from public, anon, authenticated;
grant execute on function rag_hybrid_search(uuid[], extensions.vector, text, integer, integer) to service_role;

-- Collection stats for the module's list (one round trip instead of N).
create or replace function rag_collection_stats(p_org_id uuid)
returns table (collection_id uuid, source_count bigint, document_count bigint, chunk_count bigint, last_synced_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id,
         (select count(*) from rag_sources s where s.collection_id = c.id),
         (select coalesce(sum(s.document_count), 0) from rag_sources s where s.collection_id = c.id),
         (select coalesce(sum(s.chunk_count), 0) from rag_sources s where s.collection_id = c.id),
         (select max(s.last_synced_at) from rag_sources s where s.collection_id = c.id)
  from rag_collections c
  where c.org_id = p_org_id;
$$;
