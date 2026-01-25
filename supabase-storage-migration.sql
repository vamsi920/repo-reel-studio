-- Supabase Storage: project-audio bucket for TTS audio (per-project, per-user)
-- Run this in Supabase SQL Editor. If the bucket already exists, the insert is skipped.
-- You can also create the bucket in Dashboard: Storage > New bucket > id: project-audio, set Public.

-- Create bucket if not exists
insert into storage.buckets (id, name, public)
select 'project-audio', 'project-audio', true
where not exists (select 1 from storage.buckets where id = 'project-audio');

-- Policies for storage.objects
drop policy if exists "Public read project-audio" on storage.objects;
create policy "Public read project-audio" on storage.objects
  for select using (bucket_id = 'project-audio');

drop policy if exists "Authenticated upload project-audio" on storage.objects;
create policy "Authenticated upload project-audio" on storage.objects
  for insert with check (bucket_id = 'project-audio' and auth.role() = 'authenticated');
