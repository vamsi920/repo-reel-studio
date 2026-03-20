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

// Google Cloud TTS Configuration
export const GOOGLE_TTS_API_KEY = import.meta.env.VITE_GOOGLE_TTS_API_KEY || "";
export const GOOGLE_TTS_ENABLED = Boolean(
  import.meta.env.VITE_GOOGLE_TTS_API_KEY
);

// API Configuration - normalize: strip trailing slash to avoid //api/ingest
const raw = import.meta.env.VITE_API_URL || "/api";
export const API_URL = typeof raw === "string" ? raw.replace(/\/+$/, "") : raw;

// Feature Flags
export const USE_MOCK_MANIFEST =
  import.meta.env.VITE_USE_MOCK_MANIFEST === "true";

export const VIDEO_PIPELINE_V2_ENABLED =
  import.meta.env.VITE_VIDEO_PIPELINE_V2_ENABLED !== "false";
