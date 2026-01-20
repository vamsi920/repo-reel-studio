// IMPORTANT: Set your real API keys here or in .env
// Get Gemini key from: https://aistudio.google.com/app/apikey
// Get Google TTS key from: https://console.cloud.google.com/apis/credentials

// Gemini AI Configuration
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Google Cloud TTS Configuration
export const GOOGLE_TTS_API_KEY = import.meta.env.VITE_GOOGLE_TTS_API_KEY || "";
export const GOOGLE_TTS_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_TTS_API_KEY);

// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || "/api";

// Feature Flags
export const USE_MOCK_MANIFEST = import.meta.env.VITE_USE_MOCK_MANIFEST === "true";
