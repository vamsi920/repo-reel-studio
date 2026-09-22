import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Build the in-app path to the `/launch` screen for the given plugins, so the
 * Plugins UI can start a conversation with a plugin by reusing the existing
 * launch flow. Inverse of `parsePluginsFromUrl` in `src/routes/launch.tsx` —
 * keep the base64-encoded JSON `plugins` format in sync with that decoder.
 *
 * The base64 payload can contain `+`, `/`, and `=`; encoding it through
 * `URLSearchParams` percent-escapes those so `/launch` reads back the exact
 * string (a raw `+` would otherwise be decoded as a space and break `atob`).
 *
 * `btoa` only accepts Latin1 code points (0-255), so the JSON is routed
 * through `TextEncoder` first — a plugin `source`/`ref`/`repo_path` with any
 * non-Latin1 character (e.g. an emoji or non-Latin script in a git ref) would
 * otherwise throw `DOMException: Invalid character` and crash the "Start
 * conversation" click instead of building the path.
 */
export function buildPluginLaunchPath(plugins: PluginSpec[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(plugins));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const encoded = btoa(binary);
  const params = new URLSearchParams({ plugins: encoded });
  return `/launch?${params.toString()}`;
}
