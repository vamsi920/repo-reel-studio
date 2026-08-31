-- Advisory-lock helpers for the connection proxy's token refresh.
--
-- Atlassian (and others) rotate the refresh token on every use. Two requests
-- refreshing the same connection at once means the loser writes back a token
-- the provider has already invalidated, and the connection dies under exactly
-- the concurrency that a busy install produces. Serialising on the connection
-- id makes the refresh a critical section.
--
-- hashtextextended maps the uuid text onto the bigint the advisory-lock API
-- wants; a collision would only ever cause two unrelated connections to
-- refresh one-at-a-time, which is harmless.

create or replace function environment_try_advisory_lock(lock_key text)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
as $$
  select pg_try_advisory_lock(hashtextextended(lock_key, 0));
$$;

create or replace function environment_advisory_unlock(lock_key text)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
as $$
  select pg_advisory_unlock(hashtextextended(lock_key, 0));
$$;

revoke execute on function environment_try_advisory_lock(text) from public;
revoke execute on function environment_advisory_unlock(text) from public;
revoke execute on function environment_try_advisory_lock(text) from anon, authenticated;
revoke execute on function environment_advisory_unlock(text) from anon, authenticated;
