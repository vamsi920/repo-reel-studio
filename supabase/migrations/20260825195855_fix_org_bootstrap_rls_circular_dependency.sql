-- Repairs schema drift: applied directly to the live NeoDevex project on
-- 2026-08-25 (confirmed via `supabase list_migrations`, version
-- 20260825195855) but never committed here.
--
-- `resolvePersonalOrg` (src/lib/data-platform/repositories/repository-identity.ts)
-- inserts a new `orgs` row for a brand-new user, then -- in the same
-- bootstrap, before the `org_members` self-join row exists -- other callers
-- resolving the same org need to read it back. The original "members can
-- read their orgs" policy (`is_org_member(id)` only) can't be satisfied
-- until that self-join row lands, so the row's own creator couldn't see the
-- org they had just created. Widen the SELECT policy to also allow the
-- row's own creator, closing the bootstrap-order circular dependency.

drop policy "members can read their orgs" on orgs;

create policy "members can read their orgs"
  on orgs for select
  using (is_org_member(id) or created_by = (select auth.uid()));
