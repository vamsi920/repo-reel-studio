-- Migration: Add ingestion data fields to existing projects table
-- Run this if you already have the projects table created

-- Add new columns for ingestion data
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS repo_content TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_stats JSONB,
  ADD COLUMN IF NOT EXISTS phase1_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phase2_completed_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN projects.repo_content IS 'Full repository content from ingestion phase';
COMMENT ON COLUMN projects.ingestion_stats IS 'Ingestion statistics: includedFiles, skippedFiles, totalBytes, etc.';
COMMENT ON COLUMN projects.phase1_completed_at IS 'Timestamp when Phase 1 (ingestion) completed';
COMMENT ON COLUMN projects.phase2_completed_at IS 'Timestamp when Phase 2 (manifest generation) completed';
