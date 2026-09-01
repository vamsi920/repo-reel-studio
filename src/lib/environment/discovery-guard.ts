/**
 * Refuses to store anything that looks like a credential.
 *
 * The interview is exactly where someone types a token: the agent asks "how do
 * your builds authenticate to the registry?" and a helpful person pastes the
 * answer. Recording that into the company profile would put a live secret into
 * a member-readable document, in plaintext, forever.
 *
 * Deliberately trigger-happy. A false positive costs one rephrased sentence; a
 * false negative costs a leaked credential in a durable store.
 */

const SECRET_KEY_PATTERN =
  /token|secret|password|passwd|api[_-]?key|private[_-]?key|credential|bearer/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bgho_[A-Za-z0-9]{20,}/,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\blin_api_[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
];

/** A long unbroken run of high-entropy characters, with no spaces. */
function looksHighEntropy(value: string): boolean {
  const candidate = value.trim();
  if (candidate.length < 32 || /\s/.test(candidate)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((pattern) =>
    pattern.test(candidate),
  ).length;
  return classes >= 3;
}

export type SecretScanResult =
  | { ok: true }
  | { ok: false; reason: "key_name" | "value_pattern" | "entropy"; at: string };

export function scanForSecrets(value: unknown, path = ""): SecretScanResult {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      return { ok: false, reason: "value_pattern", at: path || "value" };
    }
    if (looksHighEntropy(value)) {
      return { ok: false, reason: "entropy", at: path || "value" };
    }
    return { ok: true };
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = scanForSecrets(value[index], `${path}[${index}]`);
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const here = path ? `${path}.${key}` : key;
      if (SECRET_KEY_PATTERN.test(key)) {
        return { ok: false, reason: "key_name", at: here };
      }
      const result = scanForSecrets(entry, here);
      if (!result.ok) return result;
    }
  }

  return { ok: true };
}
