-- Lets the preflight tooling ask which Postgres extensions are installed
-- without handing anyone a general SQL surface. pg_extension is not exposed
-- through PostgREST by default, and granting broad catalogue access to do
-- one readiness check would be a poor trade.
--
-- Callable by service_role only: the preflight script and the
-- environment-probe Edge Function both run with the service key, and the
-- browser has no business enumerating the database's extensions.

create or replace function environment_installed_extensions()
returns table (extname text, extversion text)
language sql
security definer
stable
set search_path = public, extensions, pg_catalog
as $$
  select e.extname::text, e.extversion::text
  from pg_catalog.pg_extension e
  order by e.extname;
$$;

revoke execute on function environment_installed_extensions() from public;
revoke execute on function environment_installed_extensions() from anon, authenticated;
