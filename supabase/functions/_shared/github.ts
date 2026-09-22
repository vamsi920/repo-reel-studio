import { assertHostAllowed } from "./template.ts";

/**
 * Rejects a client-supplied GitHub Enterprise host that resolves to internal
 * infrastructure (loopback, link-local, cloud metadata, RFC1918, etc.).
 * `enterpriseHost` is free text a user types into the Connections settings
 * form (see `connections-settings.tsx`); without this check
 * `github-oauth-callback` would POST this deployment's
 * `GITHUB_ENTERPRISE_OAUTH_CLIENT_SECRET` to whatever host is named here --
 * an attacker naming the cloud metadata address or another internal service
 * would have the server hand that secret straight back out in the response
 * body. Reuses the same blocklist the generic connector host-override flow
 * enforces (`resolveBaseUrl`/`assertHostAllowed`) rather than a second copy.
 * Throws `TemplateError` (code `blocked_host` or `invalid_url`) when rejected.
 */
export function assertEnterpriseHostAllowed(host: string | null): void {
  if (!host) return;
  assertHostAllowed(`https://${host}`, "github");
}

/** Resolves the OAuth authorize URL for github.com or a GHES host. */
export function githubAuthorizeUrl(host: string | null): string {
  return host
    ? `https://${host}/login/oauth/authorize`
    : "https://github.com/login/oauth/authorize";
}

/** Resolves the OAuth token-exchange URL for github.com or a GHES host. */
export function githubTokenUrl(host: string | null): string {
  return host
    ? `https://${host}/login/oauth/access_token`
    : "https://github.com/login/oauth/access_token";
}

/** Resolves the REST API base URL for github.com or a GHES host. */
export function githubApiBaseUrl(host: string | null): string {
  return host ? `https://${host}/api/v3` : "https://api.github.com";
}

/**
 * GHES instances need their own OAuth App (a separate Client ID/Secret from
 * github.com's), so the credential pair is selected by whether an
 * enterprise host was requested -- not by parsing the host itself, since v1
 * only supports one optional enterprise host.
 */
export function githubOAuthCredentials(host: string | null): {
  clientId: string;
  clientSecret: string;
} {
  if (host) {
    const clientId = Deno.env.get("GITHUB_ENTERPRISE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GITHUB_ENTERPRISE_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      throw new Error(
        "GitHub Enterprise OAuth is not configured for this deployment.",
      );
    }
    return { clientId, clientSecret };
  }

  const clientId = Deno.env.get("GITHUB_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured for this deployment.");
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
