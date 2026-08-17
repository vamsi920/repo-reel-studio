-- Migration: Add ingestion data fields to existing projects table
-- Run this if you already have the projects table created

-- Add new columns for ingestion data
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS repo_content TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_stats JSONB,
  ADD COLUMN IF NOT EXISTS graph_data JSONB,
  ADD COLUMN IF NOT EXISTS repo_knowledge_graph JSONB,
  ADD COLUMN IF NOT EXISTS phase1_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phase2_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS graph_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS graph_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS graph_node_count INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN projects.repo_content IS 'Full repository content from ingestion phase';
COMMENT ON COLUMN projects.ingestion_stats IS 'Ingestion statistics: includedFiles, skippedFiles, totalBytes, etc.';
COMMENT ON COLUMN projects.graph_data IS 'Raw Code Graph RAG output for downstream tools';
COMMENT ON COLUMN projects.repo_knowledge_graph IS 'Semantic repo knowledge graph built from evidence and graph structure';
COMMENT ON COLUMN projects.phase1_completed_at IS 'Timestamp when Phase 1 (ingestion) completed';
COMMENT ON COLUMN projects.phase2_completed_at IS 'Timestamp when Phase 2 (manifest generation) completed';
COMMENT ON COLUMN projects.graph_storage_path IS 'Optional object-storage key for exported graph artifacts';
COMMENT ON COLUMN projects.graph_created_at IS 'Timestamp of last successful graph build';
COMMENT ON COLUMN projects.graph_node_count IS 'Node count from the exported graph';
