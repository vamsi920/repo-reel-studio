-- GitFlick Database Schema
-- Run this in your Supabase SQL Editor to create the tables

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_url TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'error')),
  manifest JSONB,
  duration_seconds INTEGER,
  -- Ingestion data
  repo_content TEXT, -- Full repository content from ingestion
  ingestion_stats JSONB, -- Stats: {includedFiles, skippedFiles, totalBytes, totalBytesFormatted, durationMs}
  graph_data JSONB, -- Raw Code Graph RAG output for downstream tools
  repo_knowledge_graph JSONB, -- Semantic repo knowledge graph built on top of evidence + code graph
  phase1_completed_at TIMESTAMPTZ, -- When Phase 1 (ingestion) completed
  phase2_completed_at TIMESTAMPTZ, -- When Phase 2 (manifest generation) completed
  -- Code-Graph-RAG metadata (all nullable — absent until a graph has been built)
  graph_storage_path TEXT,       -- Object-storage key, e.g. "project-graphs/<id>/graph.json"
  graph_created_at TIMESTAMPTZ,  -- Timestamp of last successful graph build
  graph_node_count INTEGER,      -- Node count from the exported JSON (for UI / debugging)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE INDEX IF NOT EXISTS projects_created_at_idx ON projects(created_at DESC);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running the schema)
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;

-- Policy: Users can only see their own projects
CREATE POLICY "Users can view their own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own projects
CREATE POLICY "Users can insert their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own projects
CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own projects
CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (for re-running the schema)
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
