-- Generic encrypt/decrypt for connection credentials.
--
-- Same shape as encrypt_github_token/decrypt_github_token in
-- 20260824130000_github_connections.sql: the key is a parameter supplied by
-- the calling Edge Function from its own environment rather than a database
-- GUC, which avoids an `ALTER DATABASE ... SET` provisioning step. That is
-- only safe because both functions are revoked from every role a browser can
-- reach -- the revoke below is the security boundary, not the parameter shape.
--
-- Two revokes are required, and forgetting the second one is the mistake
-- 20260824130100 exists to correct: Supabase grants EXECUTE on new
-- public-schema functions to anon/authenticated through ALTER DEFAULT
-- PRIVILEGES, which REVOKE ... FROM PUBLIC does not touch.

create extension if not exists pgcrypto;

create or replace function encrypt_secret(plaintext text, encryption_key text)
returns bytea
language sql
security definer
set search_path = public, extensions
as $$
  select pgp_sym_encrypt(plaintext, encryption_key);
$$;

create or replace function decrypt_secret(ciphertext bytea, encryption_key text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select pgp_sym_decrypt(ciphertext, encryption_key);
$$;

revoke execute on function encrypt_secret(text, text) from public;
revoke execute on function decrypt_secret(bytea, text) from public;
revoke execute on function encrypt_secret(text, text) from anon, authenticated;
revoke execute on function decrypt_secret(bytea, text) from anon, authenticated;
