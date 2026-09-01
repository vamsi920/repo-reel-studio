-- Publish `connections` changes so every open surface refreshes when a
-- connection is made, without anyone reloading.
--
-- THE COLUMN LIST IS THE SECURITY BOUNDARY HERE, not decoration.
--
-- `connections` revokes column-level SELECT on encrypted_credentials,
-- credential_fingerprint and credential_ref from anon/authenticated. Realtime
-- change payloads are assembled from the WAL and do NOT honour column grants
-- the way a query does, so publishing the whole table would hand every
-- subscribed org member the ciphertext those revokes exist to withhold.
-- Postgres 15+ column lists let the publication carry only what a client is
-- allowed to see anyway.
--
-- The subscriber (`src/hooks/use-connections-realtime-sync.ts`) ignores the
-- payload entirely and just refetches -- this list is the second line of
-- defence, not the first.
alter publication supabase_realtime add table connections (
  id,
  org_id,
  capability,
  provider_id,
  instance_key,
  status,
  updated_at
);
