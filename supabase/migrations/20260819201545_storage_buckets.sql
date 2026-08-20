-- Private buckets, gated by workspace membership -- unlike the legacy app's
-- project-audio/project-graphs buckets, which were public with only
-- convention-based (not policy-enforced) path scoping.

insert into storage.buckets (id, name, public)
select 'workspace-artifacts', 'workspace-artifacts', false
where not exists (select 1 from storage.buckets where id = 'workspace-artifacts');

insert into storage.buckets (id, name, public)
select 'kt-audio', 'kt-audio', false
where not exists (select 1 from storage.buckets where id = 'kt-audio');

-- Path convention: {bucket}/{workspace_id}/{...}. storage.foldername(name)
-- splits the object path into an array; index 1 is the workspace_id segment.

create policy "members can read own workspace artifacts"
  on storage.objects for select
  using (
    bucket_id = 'workspace-artifacts'
    and is_workspace_member((storage.foldername(name))[1])
  );

create policy "members can upload to own workspace artifacts"
  on storage.objects for insert
  with check (
    bucket_id = 'workspace-artifacts'
    and is_workspace_member((storage.foldername(name))[1])
  );

create policy "members can delete own workspace artifacts"
  on storage.objects for delete
  using (
    bucket_id = 'workspace-artifacts'
    and is_workspace_member((storage.foldername(name))[1])
  );

create policy "members can read own workspace kt audio"
  on storage.objects for select
  using (
    bucket_id = 'kt-audio'
    and is_workspace_member((storage.foldername(name))[1])
  );

create policy "members can upload own workspace kt audio"
  on storage.objects for insert
  with check (
    bucket_id = 'kt-audio'
    and is_workspace_member((storage.foldername(name))[1])
  );

create policy "members can delete own workspace kt audio"
  on storage.objects for delete
  using (
    bucket_id = 'kt-audio'
    and is_workspace_member((storage.foldername(name))[1])
  );
