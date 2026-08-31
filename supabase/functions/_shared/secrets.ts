import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Encryption key for connection credentials.
 *
 * Falls back to the GitHub-era key name so an existing deployment keeps
 * working without a new secret being set first, and so the backfilled rows
 * (which were encrypted under that key) stay decryptable.
 */
export function encryptionKey(): string {
  const key =
    Deno.env.get("CONNECTION_SECRET_ENCRYPTION_KEY") ??
    Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!key) throw new Error("encryption_not_configured");
  return key;
}

export async function encryptJson(
  admin: SupabaseClient,
  value: Record<string, string>,
): Promise<string> {
  const { data, error } = await admin.rpc("encrypt_secret", {
    plaintext: JSON.stringify(value),
    encryption_key: encryptionKey(),
  });
  if (error || !data) throw new Error("encryption_failed");
  return data as string;
}

export async function decryptJson(
  admin: SupabaseClient,
  ciphertext: string,
): Promise<Record<string, string>> {
  const { data, error } = await admin.rpc("decrypt_secret", {
    ciphertext,
    encryption_key: encryptionKey(),
  });
  if (error || typeof data !== "string") throw new Error("decryption_failed");
  try {
    return JSON.parse(data) as Record<string, string>;
  } catch {
    // Backfilled rows hold a bare token rather than a JSON object, because
    // that is what the legacy tables stored. Treat it as the provider's
    // primary credential rather than failing the whole connection.
    return { accessToken: data };
  }
}

/**
 * Short, non-reversible identity for a credential. Enough to notice that a
 * key was rotated, or that staging and production are accidentally sharing
 * one, without ever showing the value.
 */
export async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex.slice(0, 12)}`;
}
