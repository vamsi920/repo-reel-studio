// IMPORTANT: Set your real API keys here or in .env
// Get Gemini key from: https://aistudio.google.com/app/apikey
// Get Google TTS key from: https://console.cloud.google.com/apis/credentials

// Gemini AI Configuration
// Model must be the API model ID only (e.g. gemini-2.0-flash). No "google:" prefix.
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const rawModel = import.meta.env.VITE_GEMINI_MODEL || "";
export const GEMINI_MODEL =
  (typeof rawModel === "string" ? rawModel.replace(/^google:/i, "").trim() : "") ||
  "gemini-2.5-flash";
export const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

// Google Cloud TTS is proxy-only. Never expose a cloud credential to browser code.
// The server reads GOOGLE_TTS_API_KEY; the client only receives this feature flag.
export const GOOGLE_TTS_ENABLED =
  import.meta.env.VITE_GOOGLE_TTS_ENABLED === "true";

// API Configuration - normalize: strip trailing slash to avoid //api/ingest
const raw = import.meta.env.VITE_API_URL || "/api";
export const API_URL = typeof raw === "string" ? raw.replace(/\/+$/, "") : raw;

// Feature Flags
export const USE_MOCK_MANIFEST =
  import.meta.env.VITE_USE_MOCK_MANIFEST === "true";

export const VIDEO_PIPELINE_V2_ENABLED =
  import.meta.env.VITE_VIDEO_PIPELINE_V2_ENABLED !== "false";

/** Phase B: scene-level incremental LLM/TTS (neighbor expansion reads this when implemented). */
export const INCREMENTAL_SCENE_REGEN_ENABLED =
  import.meta.env.VITE_INCREMENTAL_SCENE_REGEN === "true";

// Debug logging for local Layman prompt compression metrics.
export const LAYMAN_PROMPT_DEBUG =
  import.meta.env.VITE_LAYMAN_PROMPT_DEBUG === "true";

// Fast kill-switch for Layman compression (debug/rollback). Defaults to enabled.
export const LAYMAN_PROMPT_ENABLED =
  import.meta.env.VITE_LAYMAN_PROMPT_ENABLED !== "false";
