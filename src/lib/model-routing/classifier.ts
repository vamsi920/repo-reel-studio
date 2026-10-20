import type { RoutingTier } from "./types";

/**
 * The "hybrid" half of the router: a tiny LLM classifier consulted only when
 * the deterministic score is ambiguous. Bounded on every axis — timeout,
 * LRU cache, hourly call cap — and any failure simply defers to the scorer.
 */
// @spec MR-009 — Ambiguity classifier
export interface ClassifierTransport {
  classify: (text: string, signal: AbortSignal) => Promise<RoutingTier | null>;
}

export interface RoutingClassifier {
  classify: (text: string) => Promise<RoutingTier | null>;
}

export const CLASSIFIER_TIMEOUT_MS = 1500;
export const CLASSIFIER_MAX_CALLS_PER_HOUR = 20;
export const CLASSIFIER_CACHE_SIZE = 200;
export const CLASSIFIER_MAX_INPUT_CHARS = 2000;
const HOUR_MS = 60 * 60_000;

/** djb2 — a stable cache key without retaining the prompt itself. */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function createRoutingClassifier(
  transport: ClassifierTransport,
  options: {
    timeoutMs?: number;
    maxCallsPerHour?: number;
    cacheSize?: number;
    now?: () => number;
  } = {},
): RoutingClassifier {
  const timeoutMs = options.timeoutMs ?? CLASSIFIER_TIMEOUT_MS;
  const maxCalls = options.maxCallsPerHour ?? CLASSIFIER_MAX_CALLS_PER_HOUR;
  const cacheSize = options.cacheSize ?? CLASSIFIER_CACHE_SIZE;
  const now = options.now ?? Date.now;
  const cache = new Map<string, RoutingTier>();
  let calls: number[] = [];

  return {
    async classify(text) {
      const input = text.slice(0, CLASSIFIER_MAX_INPUT_CHARS);
      const key = hashText(input);
      const cached = cache.get(key);
      if (cached) {
        // Refresh LRU position.
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }

      const t = now();
      calls = calls.filter((c) => t - c < HOUR_MS);
      if (calls.length >= maxCalls) return null;
      calls.push(t);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const tier = await Promise.race([
          transport.classify(input, controller.signal),
          new Promise<null>((resolve) => {
            controller.signal.addEventListener("abort", () => resolve(null));
          }),
        ]);
        if (tier) {
          cache.set(key, tier);
          if (cache.size > cacheSize) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
        }
        return tier;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Parses the classifier's one-word answer. */
export function parseClassifierLabel(raw: unknown): RoutingTier | null {
  if (typeof raw !== "string") return null;
  const label = raw.trim().toUpperCase();
  if (label.startsWith("LIGHT")) return "light";
  if (label.startsWith("STANDARD")) return "standard";
  if (label.startsWith("HEAVY") || label.startsWith("FRONTIER"))
    return "frontier";
  return null;
}
