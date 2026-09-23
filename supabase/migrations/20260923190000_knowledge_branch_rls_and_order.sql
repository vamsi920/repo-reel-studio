-- Repairs schema drift under `knowledge_generations`/`knowledge_sections`/
-- `knowledge_pages`/`knowledge_diagrams` (20260819201308_knowledge_codegraph.sql):
--
-- 1. `src/lib/data-platform/repositories/knowledge-repository.ts` has read
--    and written `knowledge_generations.branch` and
--    `knowledge_diagrams.page_id` since commit 41471b70 (2026-09-23), but no
--    committed migration ever added either column -- every query touching
--    them fails against a database that matches this repo's migrations
--    exactly. Add both, additive only.
-- 2. Two branches can share a commit sha (a branch just cut from another, or
--    a fast-forward merge). `saveFullKnowledge`'s upsert needs a unique
--    constraint that includes `branch` to target with `onConflict`, instead
--    of colliding on the pre-existing (repository_id, commit_sha) key and
--    silently overwriting one branch's generation with another's.
-- 3. The original RLS migration (20260819201510_rls_knowledge_codegraph.sql)
--    only ever granted INSERT/SELECT on these four tables. `saveFullKnowledge`
--    does an upsert-on-conflict (an UPDATE when a generation for that key
--    already exists) and deletes the previous generation's sections/pages/
--    diagrams before reinserting -- both silently denied by RLS with no
--    UPDATE/DELETE policy, caught by the function's best-effort try/catch.
--    Regenerating an already-generated repo's Knowledge never actually
--    replaced the stale persisted content. Add the missing policies.
-- 4. `knowledge_sections`/`knowledge_pages` carry no ordinal column, so
--    `reconstruct()`'s queries (no ORDER BY) can return a different page/
--    section order than the one DeepWiki originally emitted and the live
--    session rendered. Add a `position` column, populated from array index
--    on write, ordered by on read.

alter table knowledge_generations add column if not exists branch text;
alter table knowledge_diagrams add column if not exists page_id text;
alter table knowledge_sections add column if not exists position integer not null default 0;
alter table knowledge_pages add column if not exists position integer not null default 0;

alter table knowledge_generations
  add constraint knowledge_generations_repository_branch_commit_key
  unique (repository_id, branch, commit_sha);

create policy "members can update workspace knowledge generations"
  on knowledge_generations for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can delete workspace knowledge sections"
  on knowledge_sections for delete
  using (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_sections.generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can delete workspace knowledge pages"
  on knowledge_pages for delete
  using (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_pages.generation_id and is_workspace_member(g.workspace_id)
    )
  );

create policy "members can delete workspace knowledge diagrams"
  on knowledge_diagrams for delete
  using (
    exists (
      select 1 from knowledge_generations g
      where g.id = knowledge_diagrams.page_generation_id and is_workspace_member(g.workspace_id)
    )
  );
