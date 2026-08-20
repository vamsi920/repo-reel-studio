-- Tenant scoping is enforced INSIDE this function, not relied upon by the
-- caller -- callers can never run "global vector search, filter after."
-- SECURITY DEFINER so it can be granted directly without a permissive raw
-- table policy on memory_embeddings for arbitrary similarity queries.
-- search_path includes `extensions` (not just `public`) because the
-- pgvector `<=>` operator lives there.

create or replace function search_workspace_memory(
  ws_id text,
  query_embedding extensions.vector(1536),
  match_count int default 10
)
returns table (
  record_id text,
  statement text,
  subject text,
  kind text,
  status text,
  similarity float
)
language sql
security definer
stable
set search_path = public, extensions
as $$
  select
    m.id as record_id,
    m.statement,
    m.subject,
    m.kind,
    m.status,
    1 - (e.embedding <=> query_embedding) as similarity
  from memory_embeddings e
  join memory_records m on m.id = e.record_id
  where e.workspace_id = ws_id
    and is_workspace_member(ws_id)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
