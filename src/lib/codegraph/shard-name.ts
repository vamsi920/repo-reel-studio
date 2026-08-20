/**
 * Maps a level's parent id to the file name of its shard.
 *
 * Shared by the analyzer (which writes the shards inside the sandbox) and the
 * browser (which fetches them), so the two can never disagree about where a
 * level lives. Node ids contain `/`, `:` and other characters that are not
 * safe in a file name, hence the encoding.
 */

/** Base64url over UTF-8, without relying on Node's `Buffer` (this runs in both). */
function base64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Long ids are hashed rather than truncated: two deeply nested modules can
 * share a long common prefix, and truncation would collide their shards —
 * silently showing one folder's contents under another.
 */
function shortHash(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

const MAX_ENCODED_LENGTH = 100;

export function shardName(parentId: string | null): string {
  if (parentId === null) return "root";
  const encoded = base64url(parentId);
  if (encoded.length <= MAX_ENCODED_LENGTH) return encoded;
  return `${encoded.slice(0, MAX_ENCODED_LENGTH)}-${shortHash(parentId)}`;
}
