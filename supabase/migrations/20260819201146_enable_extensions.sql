-- Enable extensions used by the NeoDevEx data platform.
-- vector: memory_embeddings similarity search (pgvector)
-- pgmq: durable background queues, consumed by Edge Functions
-- pg_cron: scheduled rollups (workspace_usage_daily) and queue-trigger cron jobs
create extension if not exists vector with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;
