-- The collector's per-run event tail cursor (see scripts/agentops/collector.mjs
-- #trackerFor / #tailEvents) was never persisted for the Supabase-backed
-- store: supabase-store.mjs's rowToRun() hardcoded lastEventTimestamp: null
-- and lastEventIds: [] on every read, so a collector restart always resumed
-- with cursor: null and re-tailed every event in the conversation from the
-- start, re-incrementing agentops_runs.tool_call_count / llm_call_count /
-- error_count and re-inserting every audit record (fresh crypto.randomUUID()
-- per row, so nothing deduped it). These columns make the cursor durable
-- across restarts, matching the JSONL fallback store's existing behavior.
alter table agentops_runs
  add column last_event_timestamp timestamptz,
  add column last_event_ids text[] not null default '{}';
