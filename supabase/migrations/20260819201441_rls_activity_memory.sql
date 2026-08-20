alter table activity_events enable row level security;
alter table memory_records enable row level security;
alter table memory_embeddings enable row level security;

create policy "members can read workspace activity"
  on activity_events for select
  using (is_workspace_member(workspace_id));

create policy "members can write workspace activity"
  on activity_events for insert
  with check (is_workspace_member(workspace_id));

create policy "members can read workspace memory"
  on memory_records for select
  using (is_workspace_member(workspace_id));

create policy "members can write workspace memory"
  on memory_records for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace memory"
  on memory_records for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can delete workspace memory"
  on memory_records for delete
  using (is_workspace_member(workspace_id));

-- Raw embedding rows are member-readable (needed for administrative/debug
-- listing), but the sanctioned similarity-search path is the
-- search_workspace_memory() RPC (added in a later migration), which enforces
-- tenant scoping inside the function itself rather than relying on a caller
-- to always remember to filter by workspace_id in an ad hoc query.
create policy "members can read workspace embeddings"
  on memory_embeddings for select
  using (is_workspace_member(workspace_id));

create policy "members can write workspace embeddings"
  on memory_embeddings for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace embeddings"
  on memory_embeddings for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));
