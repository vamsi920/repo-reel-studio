-- Supabase grants EXECUTE on new public-schema functions to anon/authenticated
-- via ALTER DEFAULT PRIVILEGES at the database level, independent of the
-- PUBLIC pseudo-role grant -- REVOKE ... FROM PUBLIC alone (the pattern used
-- for the org/workspace RLS helpers) does not touch this. These two
-- functions handle the raw token and must only ever run as service_role.
revoke execute on function encrypt_github_token(text, text) from anon, authenticated;
revoke execute on function decrypt_github_token(bytea, text) from anon, authenticated;
