/**
 * Small text helpers for Neo RAG: a stable content hash (so an unchanged
 * document is never re-embedded) and secret redaction (so a token pasted into
 * a doc never lands in the index, the embedding provider or an answer).
 */

/** 64-bit FNV-1a as 16 hex chars. Not cryptographic; only a change detector. */
export function versionHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const REDACTED = "[REDACTED]";

const SECRET_PATTERNS: RegExp[] = [
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bgh[osur]_[A-Za-z0-9]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bsk_(live|test)_[A-Za-z0-9]{16,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\blin_api_[A-Za-z0-9]{20,}/g,
  /\bnrag_[a-f0-9]{24,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/**
 * `password: hunter2hunter2`, `API_KEY="abc123..."`. The value must look like
 * a literal secret (token characters, at least one digit, not a call or a
 * reference such as `os.environ.get(` or `api_key)`), so code that merely
 * names a key keeps reading correctly.
 */
const KEY_VALUE_SECRET =
  /((?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?)([A-Za-z0-9_\-+/=]{8,})(?![\w(.])/gi;

function looksLikeSecretValue(value: string): boolean {
  return /\d/.test(value) && /[A-Za-z]/.test(value) && value !== REDACTED;
}

/** Replaces secret-looking values; returns the text and how many were removed. */
export function redactSecrets(text: string): {
  text: string;
  redacted: number;
} {
  let redacted = 0;
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, () => {
      redacted += 1;
      return REDACTED;
    });
  }
  // The key=value form keeps its key so the passage still reads.
  out = out.replace(
    KEY_VALUE_SECRET,
    (match, prefix: string, value: string) => {
      if (!looksLikeSecretValue(value)) return match;
      redacted += 1;
      return `${prefix}${REDACTED}`;
    },
  );
  return { text: out, redacted };
}
