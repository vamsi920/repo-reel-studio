/** Most addresses one invite request accepts (the database enforces it too). */
export const MAX_INVITE_EMAILS = 50;

export const INVITE_ROUTE_PREFIX = "/invite/";

/**
 * Where a signed-out visitor was heading when the sign-in gate stopped them.
 * Only invitation links are remembered: an invitation is the one page a
 * brand-new person reaches before they have an account.
 */
export const POST_LOGIN_PATH_KEY = "neo-post-login-path";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}

export interface ParsedInviteEmails {
  /** Lower-cased, de-duplicated, in the order typed. */
  valid: string[];
  /** Entries that are not email addresses, as typed. */
  invalid: string[];
}

/**
 * Splits what someone typed or pasted into the invite box. Accepts commas,
 * semicolons, spaces and new lines, and the `Name <address>` form mail
 * clients copy.
 */
export function parseInviteEmails(raw: string): ParsedInviteEmails {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  raw
    .split(/[\s,;]+/)
    .map((part) => part.trim().replace(/^<|>$/g, ""))
    .filter(Boolean)
    .forEach((part) => {
      const email = part.toLowerCase();
      if (seen.has(email)) return;
      seen.add(email);
      if (isValidEmail(email)) valid.push(email);
      // A display name ("Ada Lovelace <ada@x.com>") splits into words that
      // are not addresses; only something shaped like an address attempt is
      // worth reporting back.
      else if (email.includes("@")) invalid.push(part);
    });

  return { valid, invalid };
}

export function buildInviteLink(token: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${INVITE_ROUTE_PREFIX}${encodeURIComponent(token)}`;
}

export function isInvitePath(pathname: string): boolean {
  return (
    pathname.startsWith(INVITE_ROUTE_PREFIX) &&
    pathname.length > INVITE_ROUTE_PREFIX.length
  );
}

/** Remembers an invitation link across the sign-in screen. */
export function rememberPostLoginPath(pathname: string): void {
  if (!isInvitePath(pathname)) return;
  try {
    window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, pathname);
  } catch {
    // Storage unavailable: the invitation still shows up in the app, because
    // it is addressed to the person's email.
  }
}

/** Returns the remembered invitation link once, then forgets it. */
export function consumePostLoginPath(): string | null {
  try {
    const stored = window.sessionStorage.getItem(POST_LOGIN_PATH_KEY);
    window.sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
    return stored && isInvitePath(stored) ? stored : null;
  } catch {
    return null;
  }
}
