import { describe, expect, it } from "vitest";
import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import {
  getPluginDisplayName,
  getPluginSourceLabel,
  isLocalPluginSource,
  pluginReferenceKey,
} from "#/utils/plugin-display";

const basePlugin: PluginSpec = {
  source: "github:OpenHands/extensions",
  ref: null,
  repo_path: null,
};

describe("getPluginDisplayName", () => {
  it("prefers the explicit name when set", () => {
    // Arrange / Act / Assert
    expect(
      getPluginDisplayName({ ...basePlugin, name: "city-weather" }),
    ).toBe("city-weather");
  });

  it("falls back to the last segment of repo_path when there is no name", () => {
    // Arrange / Act / Assert
    expect(
      getPluginDisplayName({ ...basePlugin, repo_path: "plugins/city-weather" }),
    ).toBe("city-weather");
  });

  it("derives a name from a github: source when there is no name or repo_path", () => {
    // Arrange / Act / Assert
    expect(getPluginDisplayName(basePlugin)).toBe("OpenHands/extensions");
  });

  it("derives a name from a git URL source's last path segment", () => {
    // Arrange / Act / Assert
    expect(
      getPluginDisplayName({
        ...basePlugin,
        source: "https://github.com/OpenHands/extensions.git",
      }),
    ).toBe("extensions");
  });

  it("returns a bare source as-is when it has no separators to derive from", () => {
    // Arrange / Act / Assert
    expect(getPluginDisplayName({ ...basePlugin, source: "local" })).toBe(
      "local",
    );
  });
});

describe("isLocalPluginSource", () => {
  it("treats a github: source as remote", () => {
    expect(isLocalPluginSource(basePlugin)).toBe(false);
  });

  it("treats a git URL source as remote", () => {
    expect(
      isLocalPluginSource({
        ...basePlugin,
        source: "https://github.com/OpenHands/extensions.git",
      }),
    ).toBe(false);
  });

  it("treats a bare filesystem path as local", () => {
    expect(
      isLocalPluginSource({ ...basePlugin, source: "/home/user/my-plugin" }),
    ).toBe(true);
  });

  it("treats the local sentinel as local", () => {
    expect(isLocalPluginSource({ ...basePlugin, source: "local" })).toBe(true);
  });
});

describe("getPluginSourceLabel", () => {
  it("strips the github: prefix and appends the ref", () => {
    expect(
      getPluginSourceLabel({ ...basePlugin, ref: "main" }),
    ).toBe("OpenHands/extensions @ main");
  });

  it("omits the ref suffix when there is no ref", () => {
    expect(getPluginSourceLabel(basePlugin)).toBe("OpenHands/extensions");
  });
});

describe("pluginReferenceKey", () => {
  it("treats missing and explicit-null coordinates as the same identity", () => {
    // Arrange / Act / Assert: an undefined ref/repo_path and an explicit null
    // hash equally, since a catalog spec and a stored spec may differ only in
    // which of those two forms they use for "no value".
    expect(pluginReferenceKey({ source: "github:o/a" })).toBe(
      pluginReferenceKey({ source: "github:o/a", ref: null, repo_path: null }),
    );
  });

  it("does not collide when a coordinate value itself contains the field separator", () => {
    // Arrange: two genuinely different plugins whose source/ref would tie
    // under a naive `[source, ref, repo_path].join(" ")` key, since the
    // boundary between fields is ambiguous once a value contains a space.
    // This is exactly the collision class `pluginSpecKey` was hardened
    // against; this key must not regress to the vulnerable form.
    // Assert: their identities must stay distinct.
    expect(
      pluginReferenceKey({ source: "foo", ref: "bar", repo_path: null }),
    ).not.toBe(
      pluginReferenceKey({ source: "foo bar", ref: "", repo_path: null }),
    );
  });
});
