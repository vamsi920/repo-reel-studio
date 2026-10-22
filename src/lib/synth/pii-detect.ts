import type { SemanticKind } from "./model";

/**
 * Personal data recognised by its VALUES, not its column name: a column
 * called `col7` that holds email addresses is still an email column, and a
 * `notes` column that holds "call me on 212 555 0100" still leaks a phone
 * number. Used when learning a model from sample rows and when masking a
 * real export.
 */

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const SSN = /^\d{3}-\d{2}-\d{4}$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,7}$/i;
const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const PHONE = /^\+?[\d\s().-]{7,20}$/;

/** What a single value looks like, or null when it looks like nothing personal. */
export function detectValue(value: unknown): SemanticKind | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (EMAIL.test(text)) return "email";
  if (SSN.test(text)) return "ssn";
  if (MAC.test(text)) return "mac_address";
  if (IPV4.test(text) || IPV6.test(text)) return "ip_address";
  if (ibanValid(text)) return "iban";
  const digits = text.replace(/[\s-]/g, "");
  if (/^\d{13,19}$/.test(digits) && luhnValid(digits)) return "card_number";
  if (PHONE.test(text)) {
    const count = text.replace(/\D/g, "").length;
    // A bare number is a phone only when it is written like one.
    if (count >= 10 && count <= 15 && (/[+\s().-]/.test(text) || count >= 11)) {
      return "phone";
    }
  }
  return null;
}

/**
 * The personal-data meaning most values of a column share (at least 60%
 * of the non-empty ones, and at least two), or null.
 */
export function detectColumnSemantic(values: unknown[]): SemanticKind | null {
  const present = values.filter(
    (v) => v !== null && v !== undefined && String(v).trim() !== "",
  );
  if (present.length === 0) return null;
  const counts = new Map<SemanticKind, number>();
  for (const v of present) {
    const kind = detectValue(v);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let best: SemanticKind | null = null;
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  const needed = Math.max(Math.min(2, present.length), present.length * 0.6);
  return best && bestCount >= needed ? best : null;
}

/** Personal data that can hide inside free text, with its placeholder. */
const EMBEDDED: {
  label: string;
  pattern: RegExp;
  check?: (m: string) => boolean;
}[] = [
  {
    label: "[email]",
    pattern: /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[A-Za-z]{2,}/g,
  },
  { label: "[ssn]", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    label: "[iban]",
    pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g,
    check: ibanValid,
  },
  {
    label: "[card]",
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    check: (m) => luhnValid(m.replace(/[ -]/g, "")),
  },
  {
    label: "[ip]",
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
  {
    label: "[phone]",
    pattern:
      /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}[\s.-]?\d{3,4}\b/g,
    check: (m) => {
      const n = m.replace(/\D/g, "").length;
      return n >= 10 && n <= 15;
    },
  },
];

/** Replaces personal data found inside free text with placeholders. */
export function scrubFreeText(text: string): { text: string; found: number } {
  let found = 0;
  let out = text;
  for (const { label, pattern, check } of EMBEDDED) {
    out = out.replace(pattern, (match) => {
      if (check && !check(match)) return match;
      found += 1;
      return label;
    });
  }
  return { text: out, found };
}

export function containsPersonalData(text: string): boolean {
  return scrubFreeText(text).found > 0;
}
