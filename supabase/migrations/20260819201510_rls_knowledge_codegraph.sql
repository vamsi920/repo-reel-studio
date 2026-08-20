alter table knowledge_generations enable row level security;
alter table knowledge_sections enable row level security;
alter table knowledge_pages enable row level security;
alter table knowledge_diagrams enable row level security;
alter table codegraph_snapshots enable row level security;

create policy "members can read workspace knowledge generations"
  on knowledge_generations for select
  using (is_workspace_member(workspace_id));

create policy "members can write workspace knowledge generations"
  on knowledge_generations for insert
  with check (is_workspace_member(workspace_id));

create policy "members can read workspace knowledge sections"
  on knowledge_sections for select
  using (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_sections.generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can write workspace knowledge sections"
  on knowledge_sections for insert
  with check (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_sections.generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can read workspace knowledge pages"
  on knowledge_pages for select
  using (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_pages.generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can write workspace knowledge pages"
  on knowledge_pages for insert
  with check (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_pages.generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can read workspace knowledge diagrams"
  on knowledge_diagrams for select
  using (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_diagrams.page_generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can write workspace knowledge diagrams"
  on knowledge_diagrams for insert
  with check (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_diagrams.page_generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can read workspace codegraph snapshots"
  on codegraph_snapshots for select
  using (is_workspace_member(workspace_id));

create policy "members can write workspace codegraph snapshots"
  on codegraph_snapshots for insert
  with check (is_workspace_member(workspace_id));
