import { describe, expect, it } from "vitest";
import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import { buildPluginLaunchPath } from "#/utils/plugin-launch-url";

describe("buildPluginLaunchPath", () => {
  it("encodes plugins into a /launch path that decodes back to the same specs", () => {
    // Arrange: coordinates whose JSON base64-encodes with URL-special chars (+ / =).
    const plugins: PluginSpec[] = [
      {
        source: "github:OpenHands/extensions",
        ref: "v1.2+3",
        repo_path: "sub/dir",
      },
    ];

    // Act: build the path, then decode the `plugins` param the way /launch does.
    const path = buildPluginLaunchPath(plugins);
    const url = new URL(path, "http://localhost");
    const decoded = JSON.parse(atob(url.searchParams.get("plugins") ?? ""));

    // Assert: it targets /launch and round-trips the coordinates without corruption.
    expect(url.pathname).toBe("/launch");
    expect(decoded).toEqual(plugins);
  });

  it("does not throw for coordinates containing non-Latin1 characters", () => {
    // Arrange: `btoa` only accepts Latin1 (0-255) code points, so a plugin
    // whose ref/source/repo_path carries an emoji or non-Latin script would
    // throw `DOMException: Invalid character` if the JSON were passed to
    // `btoa` directly instead of being routed through `TextEncoder` first.
    const plugins: PluginSpec[] = [
      {
        source: "github:OpenHands/extensions",
        ref: "🚀-release",
        repo_path: "路径/skills",
      },
    ];

    // Act
    let path = "";
    expect(() => {
      path = buildPluginLaunchPath(plugins);
    }).not.toThrow();

    // Assert: decoding through the UTF-8-safe path (mirroring
    // `parsePluginsFromUrl` in `src/routes/launch.tsx`) recovers the
    // original, non-mangled characters.
    const url = new URL(path, "http://localhost");
    const binary = atob(url.searchParams.get("plugins") ?? "");
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    expect(decoded).toEqual(plugins);
  });
});
