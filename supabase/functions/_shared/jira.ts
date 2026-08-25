export const JIRA_AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
export const JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
export const JIRA_ACCESSIBLE_RESOURCES_URL =
  "https://api.atlassian.com/oauth/token/accessible-resources";

/** Jira REST API base for one resolved cloud site. */
export function jiraApiBaseUrl(cloudId: string): string {
  return `https://api.atlassian.com/ex/jira/${cloudId}`;
}

export function jiraOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = Deno.env.get("JIRA_CLIENT_ID");
  const clientSecret = Deno.env.get("JIRA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Jira OAuth is not configured for this deployment.");
  }
  return { clientId, clientSecret };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function pkceChallengeFromVerifier(
  verifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

export interface AccessibleResource {
  id: string; // cloudId
  url: string;
  name: string;
  scopes: string[];
}

/**
 * A user may have multiple Jira sites; v1 only supports one connection per
 * user, so this always takes the first accessible resource -- same
 * one-connection shape `github_connections` already established.
 */
export async function resolveFirstAccessibleResource(
  accessToken: string,
): Promise<AccessibleResource | null> {
  const response = await fetch(JIRA_ACCESSIBLE_RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  const resources = (await response.json()) as AccessibleResource[];
  return resources[0] ?? null;
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verifies an Atlassian OAuth 2.0 webhook's bearer token: a JWT, HS256-signed
 * with the app's own OAuth client secret (per Atlassian's webhook docs --
 * "Webhooks for OAuth 2.0 apps are secured by bearer authentication...
 * signed with the app's client secret"). Returns the decoded payload only
 * when the signature is valid; never trusts an unverified payload.
 */
export async function verifyAtlassianWebhookJwt(
  token: string,
  clientSecret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecodeToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) return null;

  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64)));
  } catch {
    return null;
  }
}

/** Hex-encoded HMAC-SHA256, for signing requests forwarded to the
 * automation service's custom-webhook ingress (`verify_signature` there
 * expects a plain hex digest, same convention as GitHub's
 * `X-Hub-Signature-256` minus the `sha256=` prefix -- callers add any prefix
 * their `signature_header` convention needs). */
export async function hmacSha256Hex(
  secret: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const JIRA_WEBHOOK_REGISTER_URL_TEMPLATE =
  "https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/webhook";
export const JIRA_WEBHOOK_REFRESH_URL_TEMPLATE =
  "https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/webhook/refresh";
