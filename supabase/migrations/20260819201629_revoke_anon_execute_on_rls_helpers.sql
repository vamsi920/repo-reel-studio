-- The advisor flags these SECURITY DEFINER helpers as callable directly via
-- PostgREST RPC. `authenticated` must keep EXECUTE -- RLS policy evaluation
-- runs as the querying role, so an authenticated user needs permission to
-- call the function even though it then runs with definer privileges
-- internally. `anon` has no use for them (no anon-facing policy exists on
-- any table in this schema) and is revoked explicitly.
--
-- NOTE: this migration alone is insufficient -- see the next migration.
-- Postgres grants EXECUTE to PUBLIC by default on function creation, so a
-- revoke targeted only at `anon` is a no-op when `anon` only ever held the
-- privilege via the PUBLIC grant. Kept as a historical step; superseded by
-- fix_rls_helper_grants.sql.

revoke execute on function is_workspace_member(text) from anon;
revoke execute on function has_workspace_role(text, text) from anon;
revoke execute on function is_org_member(uuid) from anon;
revoke execute on function has_org_role(uuid, text) from anon;
revoke execute on function search_workspace_memory(text, extensions.vector, int) from anon;
