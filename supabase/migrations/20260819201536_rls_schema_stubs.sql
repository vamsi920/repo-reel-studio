alter table sme_reviews enable row level security;
alter table sme_documents enable row level security;
alter table requirements_sessions enable row level security;
alter table requirements_documents enable row level security;
alter table kt_videos enable row level security;

create policy "members can read sme reviews"
  on sme_reviews for select
  using (is_workspace_member(workspace_id));

create policy "members can write sme reviews"
  on sme_reviews for insert
  with check (is_workspace_member(workspace_id));

create policy "members can read sme documents"
  on sme_documents for select
  using (is_workspace_member(workspace_id));

create policy "members can write sme documents"
  on sme_documents for insert
  with check (is_workspace_member(workspace_id));

create policy "members can read requirements sessions"
  on requirements_sessions for select
  using (is_workspace_member(workspace_id));

create policy "members can write requirements sessions"
  on requirements_sessions for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update requirements sessions"
  on requirements_sessions for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can read requirements documents"
  on requirements_documents for select
  using (
    exists (
      select 1 from requirements_sessions s
      where s.id = requirements_documents.session_id and is_workspace_member(s.workspace_id)
    )
  );

create policy "members can write requirements documents"
  on requirements_documents for insert
  with check (
    exists (
      select 1 from requirements_sessions s
      where s.id = requirements_documents.session_id and is_workspace_member(s.workspace_id)
    )
  );

create policy "members can read kt videos"
  on kt_videos for select
  using (is_workspace_member(workspace_id));

create policy "members can write kt videos"
  on kt_videos for insert
  with check (is_workspace_member(workspace_id));
