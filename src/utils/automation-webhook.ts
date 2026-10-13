/**
 * Webhook-triggered automations: any service that can POST JSON (a CI
 * system, a monitoring alert, a form, a script) can start a run.
 *
 * Benchmarked against Devin (case-studies/automations, round 4): Devin's
 * automations accept webhooks from the UI and show the URL, secret and a test
 * command; ours could only be wired through the API (scenario A3). Each
 * webhook automation gets its own custom webhook source, so a test event
 * reaches exactly that automation and nothing else.
 */

/**
 * Pulls an event name out of any payload: the common field names first, then
 * a literal fallback, so a payload without any of them still triggers
 * instead of being rejected by the service ("could not extract event_key").
 */
export const WEBHOOK_EVENT_KEY_EXPR = "type || event || action || 'webhook'";

/** Event sources with a built-in or app-managed meaning; never ours to delete. */
const RESERVED_SOURCES = new Set([
  "github",
  "github-ci",
  "jira",
  "bitbucket",
  "bitbucket_data_center",
  "gitlab",
  "linear",
  "slack",
]);

export function isCustomWebhookSource(source: string | undefined): boolean {
  return !!source && !RESERVED_SOURCES.has(source);
}

/**
 * A unique webhook source for an automation: its name as a slug plus a
 * random suffix (the service allows lowercase letters, digits and hyphens,
 * 50 characters at most).
 */
export function webhookSourceFor(name: string, suffix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const tail = suffix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return `${slug || "webhook"}-${tail}`;
}

export function buildWebhookTrigger(source: string, match: string) {
  return {
    type: "event",
    source,
    // fnmatch pattern; "*" runs on every event the webhook receives.
    on: match.trim() || "*",
  };
}

export const WEBHOOK_TEST_PAYLOAD = {
  type: "test",
  message: "Test event sent from NeoDevEx",
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** A copy-paste command that sends a correctly signed test event. */
export function buildWebhookCurl({
  url,
  header,
  secret,
}: {
  url: string;
  header: string;
  secret: string;
}): string {
  const body = JSON.stringify(WEBHOOK_TEST_PAYLOAD);
  return [
    `BODY=${shellQuote(body)}`,
    `SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac ${shellQuote(secret)} | sed 's/^.* //')`,
    `curl -X POST ${shellQuote(url)} -H 'Content-Type: application/json' -H "${header}: sha256=$SIG" -d "$BODY"`,
  ].join("\n");
}

/** HMAC-SHA256 of the body as `sha256=<hex>`, the format the service checks. */
export async function signWebhookBody(
  body: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

/** The path part of a webhook URL, so the app posts through its own origin. */
export function webhookPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * The signing secret is only returned when a webhook is created or its
 * secret rotated. Keep it in memory for this tab so the detail page can show
 * it once right after creation; it is never written to storage.
 */
const freshSecrets = new Map<string, string>();

export function rememberWebhookSecret(source: string, secret: string) {
  freshSecrets.set(source, secret);
}

export function recallWebhookSecret(source: string): string | null {
  return freshSecrets.get(source) ?? null;
}
