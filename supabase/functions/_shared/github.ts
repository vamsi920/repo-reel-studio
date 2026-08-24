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
