-- Migration: add graph-backed persistence fields to existing projects table
-- Run this in Supabase SQL Editor for older deployments that predate Code Graph RAG V2.

alter table projects
  add column if not exists graph_data jsonb,
  add column if not exists repo_knowledge_graph jsonb,
  add column if not exists graph_storage_path text,
  add column if not exists graph_created_at timestamptz,
  add column if not exists graph_node_count integer;

comment on column projects.graph_data is 'Raw Code Graph RAG output for downstream tools';
comment on column projects.repo_knowledge_graph is 'Semantic repo knowledge graph built from evidence and graph structure';
comment on column projects.graph_storage_path is 'Optional object-storage key for exported graph artifacts';
comment on column projects.graph_created_at is 'Timestamp of last successful graph build';
comment on column projects.graph_node_count is 'Node count from the exported graph';
