import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { holdsAdvisoryLock } from "./advisory-lock.ts";

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

/** Small leeway for clock drift between Atlassian and this function's host
 * when checking `exp`, so a token doesn't get rejected a few seconds early. */
const JWT_CLOCK_SKEW_LEEWAY_SECONDS = 60;

/**
 * Verifies an Atlassian OAuth 2.0 webhook's bearer token: a JWT, HS256-signed
 * with the app's own OAuth client secret (per Atlassian's webhook docs --
 * "Webhooks for OAuth 2.0 apps are secured by bearer authentication...
 * signed with the app's client secret"). Returns the decoded payload only
 * when the signature is valid AND the token's `exp` claim has not passed;
 * never trusts an unverified or expired payload. A valid signature alone
 * doesn't expire, so without this check any JWT this app ever issued (e.g.
 * one captured in a log or proxy) would remain a usable bearer credential
 * forever.
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

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64)),
    );
  } catch {
    return null;
  }

  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  const nowSeconds = Date.now() / 1000;
  if (exp + JWT_CLOCK_SKEW_LEEWAY_SECONDS < nowSeconds) return null;

  return payload;
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

export async function decryptJiraToken(
  admin: SupabaseClient,
  ciphertext: string,
  encryptionKey: string,
): Promise<string | null> {
  const { data } = await admin.rpc("decrypt_github_token", {
    ciphertext,
    encryption_key: encryptionKey,
  });
  return data ?? null;
}

async function encryptJiraToken(
  admin: SupabaseClient,
  token: string,
  encryptionKey: string,
): Promise<string | null> {
  const { data } = await admin.rpc("encrypt_github_token", {
    token,
    encryption_key: encryptionKey,
  });
  return data ?? null;
}

/**
 * Refreshes a Jira access token when the caller already knows the current
 * one is dead (e.g. a proxy that just got a 401 from the Jira API), unlike
 * `refreshJiraAccessToken` above which refreshes unconditionally on a fixed
 * schedule. Serialised through the same Postgres advisory lock
 * `connections-proxy` uses for the identical reason: Atlassian rotates the
 * refresh token on every use, so two concurrent 401s for the same connection
 * (two tabs, or a refetch racing a mount) both reading the same
 * not-yet-rotated refresh token race to redeem it -- the loser's grant is
 * rejected outright, or worse, its stale write clobbers the winner's
 * freshly-issued pair. A caller that loses the race reuses whatever the
 * winner lands on instead of racing a second grant. Returns `null` (rather
 * than falling back to the token already known to be dead) so the caller can
 * tell "no usable token" apart from "here's one worth retrying with".
 */
export async function refreshJiraAccessTokenLocked(
  admin: SupabaseClient,
  userId: string,
  refreshToken: string,
  encryptionKey: string,
): Promise<string | null> {
  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = jiraOAuthCredentials());
  } catch {
    return null;
  }

  const lockKey = `jira:${userId}`;
  const { data: gotLock, error: lockError } = await admin.rpc(
    "environment_try_advisory_lock",
    { lock_key: lockKey },
  );
  if (!holdsAdvisoryLock(gotLock, lockError)) {
    const { data: current } = await admin
      .from("jira_connections")
      .select("encrypted_access_token")
      .eq("user_id", userId)
      .maybeSingle<{ encrypted_access_token: string }>();
    if (!current) return null;
    return decryptJiraToken(admin, current.encrypted_access_token, encryptionKey);
  }

  try {
    const response = await fetch(JIRA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const accessToken: string | undefined = json.access_token;
    const newRefreshToken: string | undefined = json.refresh_token;
    if (!accessToken) return null;

    const encryptedAccessToken = await encryptJiraToken(admin, accessToken, encryptionKey);
    if (!encryptedAccessToken) return null;
    const encryptedRefreshToken = newRefreshToken
      ? await encryptJiraToken(admin, newRefreshToken, encryptionKey)
      : null;

    await admin
      .from("jira_connections")
      .update({
        encrypted_access_token: encryptedAccessToken,
        ...(encryptedRefreshToken
          ? { encrypted_refresh_token: encryptedRefreshToken }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return accessToken;
  } finally {
    await admin.rpc("environment_advisory_unlock", { lock_key: lockKey });
  }
}

/**
 * Refreshes a Jira access token and persists the result, unconditionally --
 * callers that fire on an unpredictable schedule relative to the ~1hr
 * Atlassian access-token lifetime (a webhook that can arrive at any point in
 * that hour, or a once-daily cron almost certainly past it) have no cheaper
 * correct check than just refreshing every time. Falls back to the existing
 * (possibly stale) access token if the refresh itself fails, so a transient
 * Atlassian hiccup doesn't drop the caller's run entirely.
 */
export async function refreshJiraAccessToken(
  admin: SupabaseClient,
  userId: string,
  refreshToken: string,
  fallbackAccessToken: string,
  encryptionKey: string,
): Promise<string> {
  try {
    const { clientId, clientSecret } = jiraOAuthCredentials();
    const response = await fetch(JIRA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });
    if (!response.ok) return fallbackAccessToken;
    const json = await response.json();
    const accessToken: string | undefined = json.access_token;
    const newRefreshToken: string | undefined = json.refresh_token;
    if (!accessToken) return fallbackAccessToken;

    const encryptedAccessToken = await encryptJiraToken(
      admin,
      accessToken,
      encryptionKey,
    );
    const encryptedRefreshToken = newRefreshToken
      ? await encryptJiraToken(admin, newRefreshToken, encryptionKey)
      : null;
    if (encryptedAccessToken) {
      await admin
        .from("jira_connections")
        .update({
          encrypted_access_token: encryptedAccessToken,
          ...(encryptedRefreshToken
            ? { encrypted_refresh_token: encryptedRefreshToken }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
    return accessToken;
  } catch {
    return fallbackAccessToken;
  }
}
