-- Repairs schema drift: this migration was applied directly to the live
-- NeoDevex project on 2026-08-25 (confirmed via `supabase list_migrations`,
-- version 20260825195512) but the file itself was never committed here, so
-- a fresh environment built from this repo's migrations alone (local dev,
-- CI, disaster recovery) would be missing it entirely.
--
-- `src/lib/data-platform/repositories/repository-identity.ts`'s
-- `ensureRepositoryRow`/`findRepositoryUuid(..., localPath)` have upserted
-- and filtered on `repositories.local_path` since they were written -- the
-- `owner === "local"` disambiguation for two different local clones sharing
-- a basename. Without this column (confirmed present on the live project),
-- every one of those calls would fail with a real `42703 column
-- "local_path" does not exist` error. The original `(org_id, owner, name)`
-- unique constraint is replaced (not just supplemented) so the code's own
-- `onConflict: "org_id,owner,name,local_path"` target actually governs
-- conflicts -- keeping the narrower constraint around would still reject
-- two local clones sharing a basename before that target is ever consulted.

alter table repositories add column if not exists local_path text not null default '';

alter table repositories drop constraint if exists repositories_org_id_owner_name_key;

alter table repositories
  add constraint repositories_org_id_owner_name_local_path_key
  unique (org_id, owner, name, local_path);
