import type { KtTutorial, TutorialChapter } from "./tutorial-types";

/**
 * Tab-lifetime cache of built tutorials, keyed by repository, page and
 * commit. A tutorial costs several LLM calls and a round of speech
 * synthesis, and its audio lives in blob URLs that only this tab can play,
 * so it is deliberately kept in memory rather than persisted.
 */
const MAX_ENTRIES = 12;
const cache = new Map<string, KtTutorial>();

export function tutorialCacheKey(
  repositoryId: string,
  pageId: string,
  commitSha: string,
): string {
  return `${repositoryId}::${pageId}::${commitSha}`;
}

export function getCachedTutorial(key: string): KtTutorial | undefined {
  const hit = cache.get(key);
  if (hit) {
    // Refresh insertion order so the most recently watched survive longest.
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

export function setCachedTutorial(key: string, tutorial: KtTutorial): void {
  if (!cache.has(key) && cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      const evicted = cache.get(oldest);
      cache.delete(oldest);
      if (evicted?.audio && typeof URL !== "undefined" && URL.revokeObjectURL) {
        Object.values(evicted.audio).forEach((clip) => {
          try {
            URL.revokeObjectURL(clip.url);
          } catch {
            // best effort
          }
        });
      }
    }
  }
  cache.set(key, tutorial);
}

export function clearTutorialCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Script persistence
// ---------------------------------------------------------------------------

export interface PersistedScript {
  chapters: TutorialChapter[];
  source: "llm" | "deterministic";
  wordCount: number;
  savedAt: number;
}

/**
 * The script (chapters + narration, no audio) is the expensive, reusable
 * part of a tutorial: several model calls that a page reload or a later
 * visit should never have to repeat. Audio is re-synthesised from it. One
 * localStorage blob, newest-first, capped so it can't grow without bound.
 */
export const SCRIPT_STORAGE_KEY = "openhands-kt-tutorial-scripts";
const MAX_PERSISTED_SCRIPTS = 20;

function readAllScripts(): Record<string, PersistedScript> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, PersistedScript>)
      : {};
  } catch {
    return {};
  }
}

export function readPersistedScript(key: string): PersistedScript | null {
  const entry = readAllScripts()[key];
  return entry && Array.isArray(entry.chapters) && entry.chapters.length > 0
    ? entry
    : null;
}

export function writePersistedScript(
  key: string,
  script: Omit<PersistedScript, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  const all = readAllScripts();
  all[key] = { ...script, savedAt: Date.now() };
  const entries = Object.entries(all)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, MAX_PERSISTED_SCRIPTS);
  try {
    window.localStorage.setItem(
      SCRIPT_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Storage full or blocked: the in-memory tutorial still works.
  }
}
