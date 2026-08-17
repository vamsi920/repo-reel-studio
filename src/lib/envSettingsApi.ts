// API client for server/env_settings_api.py (mounted at /api/env-settings),
// proxied by Node ingestion in dev (see ingestion-server.mjs's
// /api/env-settings block) and by the deployed backend origin in prod —
// same pattern as requirementsOnboarding/api.ts.

import { API_URL } from "@/env";

export interface DetectedStack {
  languages: string[];
  primary_language: string | null;
  package_manager: string | null;
  install_command: string | null;
  test_commands: string[];
  lint_commands: string[];
  build_commands: string[];
  has_devcontainer: boolean;
  devcontainer_path: string | null;
  devcontainer_warnings: string[];
  base_image_override: string | null;
  override_source: string | null;
}

export interface EnvOverride {
  project_id: string;
  install_command: string | null;
  build_commands: string[];
  test_commands: string[];
  base_image: string | null;
  updated_at: string | null;
  detected: DetectedStack | null;
}

export interface EnvOverrideInput {
  install_command?: string | null;
  build_commands?: string[];
  test_commands?: string[];
  base_image?: string | null;
}

function envSettingsUrl(projectId: string): string {
  return API_URL === "/api"
    ? `/api/env-settings/${encodeURIComponent(projectId)}`
    : `${API_URL}/api/env-settings/${encodeURIComponent(projectId)}`;
}

/** Fetch the current stack override for a project (empty defaults if none set). */
export async function getEnvOverride(projectId: string): Promise<EnvOverride> {
  const res = await fetch(envSettingsUrl(projectId));
  const data = (await res.json().catch(() => ({}))) as EnvOverride;
  if (!res.ok) {
    throw new Error(`Failed to load stack settings (${res.status})`);
  }
  return data;
}

/** Save a project's stack override — takes precedence over auto-detection. */
export async function saveEnvOverride(
  projectId: string,
  input: EnvOverrideInput
): Promise<EnvOverride> {
  const res = await fetch(envSettingsUrl(projectId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as EnvOverride;
  if (!res.ok) {
    throw new Error((data as { detail?: string })?.detail || `Failed to save stack settings (${res.status})`);
  }
  return data;
}
