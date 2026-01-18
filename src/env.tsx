// IMPORTANT: Set your real Gemini API key here or in .env
// Get your key from: https://aistudio.google.com/app/apikey
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
