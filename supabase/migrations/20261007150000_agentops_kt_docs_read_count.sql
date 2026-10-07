-- How many times a run's agent read its KT (knowledge transfer) docs
-- (`.neodevex/kt/` or `docs/kt/`), counted by scripts/agentops/map-events.mjs.
-- Additive with a default, so existing rows and older collectors are unaffected.
alter table public.agentops_runs
  add column if not exists kt_docs_read_count integer not null default 0;
