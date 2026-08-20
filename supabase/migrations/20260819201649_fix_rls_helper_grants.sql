-- Postgres grants EXECUTE to the PUBLIC pseudo-role by default on function
-- creation, so a revoke targeted only at `anon` was a no-op (anon inherited
-- via PUBLIC, not via a direct grant). Revoke from PUBLIC, then grant back
-- only to `authenticated`, which RLS policy evaluation requires.

revoke execute on function is_workspace_member(text) from public;
revoke execute on function has_workspace_role(text, text) from public;
revoke execute on function is_org_member(uuid) from public;
revoke execute on function has_org_role(uuid, text) from public;
revoke execute on function search_workspace_memory(text, extensions.vector, int) from public;

grant execute on function is_workspace_member(text) to authenticated;
grant execute on function has_workspace_role(text, text) to authenticated;
grant execute on function is_org_member(uuid) to authenticated;
grant execute on function has_org_role(uuid, text) to authenticated;
grant execute on function search_workspace_memory(text, extensions.vector, int) to authenticated;
