-- Per-project "Stack & Environment" overrides — lets a project specify its
-- own install/build/test commands and base image, taking precedence over
-- env_builder.py's auto-detection. Read/written server-side only via
-- server/env_settings_api.py (service-role key, bypasses RLS below).
--
-- Deliberately keyed by project_id alone — no org/tenant column yet. When
-- real multi-tenancy lands this just needs an org_id column added, not a
-- reshape.

CREATE TABLE IF NOT EXISTS project_env_overrides (
  project_id TEXT PRIMARY KEY,
  install_command TEXT,
  build_commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  base_image TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE project_env_overrides ENABLE ROW LEVEL SECURITY;

-- No auth/login in this app yet (see src/lib/supabaseClient.ts) — every
-- project belongs to the single global user, so RLS is permissive by
-- design, matching the rest of the schema. Server-side access already goes
-- through the service-role key regardless.
DROP POLICY IF EXISTS "Permissive access to project_env_overrides" ON project_env_overrides;
CREATE POLICY "Permissive access to project_env_overrides"
  ON project_env_overrides
  FOR ALL
  USING (true)
  WITH CHECK (true);
