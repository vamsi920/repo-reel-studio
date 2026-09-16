import { describe, it, expect } from "vitest";
import {
  buildPluginSlashCommands,
  pluginMatchesInstalled,
} from "#/utils/plugin-slash-commands";
import type { InstalledPluginInfo } from "#/api/plugins-management-service";

function makeInstalled(
  overrides: Partial<InstalledPluginInfo> & { name: string },
): InstalledPluginInfo {
  return {
    version: "1.0.0",
    description: null,
    enabled: true,
    source: `github:acme/${overrides.name}`,
    installed_at: "2026-09-16T00:00:00Z",
    install_path: `/plugins/installed/${overrides.name}`,
    ...overrides,
  };
}

describe("pluginMatchesInstalled", () => {
  it("matches on the snapshot name when present", () => {
    const installed = makeInstalled({ name: "city-weather" });
    expect(
      pluginMatchesInstalled(
        { source: "local", name: "city-weather" },
        installed,
      ),
    ).toBe(true);
    expect(
      pluginMatchesInstalled({ source: "local", name: "other" }, installed),
    ).toBe(false);
  });

  it("falls back to source + repo_path, ignoring ref", () => {
    const installed = makeInstalled({
      name: "city-weather",
      source: "github:acme/plugins",
      repo_path: "plugins/city-weather",
      resolved_ref: "abc123",
    });
    expect(
      pluginMatchesInstalled(
        { source: "github:acme/plugins", repo_path: "plugins/city-weather" },
        installed,
      ),
    ).toBe(true);
    expect(
      pluginMatchesInstalled(
        { source: "github:acme/plugins", repo_path: "plugins/other" },
        installed,
      ),
    ).toBe(false);
  });
});

describe("buildPluginSlashCommands", () => {
  it("derives /<skill> commands from the loaded plugins' bundled skills", () => {
    const installed = [
      makeInstalled({
        name: "city-weather",
        skills: [
          { name: "city-weather:now", description: "Current weather" },
          { name: "city-weather:forecast" },
        ],
      }),
      makeInstalled({
        name: "unrelated",
        skills: [{ name: "unrelated:run" }],
      }),
    ];

    const items = buildPluginSlashCommands(
      [{ source: "github:acme/city-weather" }],
      installed,
    );

    expect(items.map((i) => i.command)).toEqual([
      "/city-weather:now",
      "/city-weather:forecast",
    ]);
    expect(items[0].skill).toEqual({
      name: "city-weather:now",
      type: "agentskills",
      source: "city-weather",
      description: "Current weather",
      triggers: ["/city-weather:now"],
    });
  });

  it("returns nothing for plugins without bundled skill data", () => {
    expect(
      buildPluginSlashCommands(
        [{ source: "github:acme/old" }],
        [makeInstalled({ name: "old", skills: null })],
      ),
    ).toEqual([]);
    expect(
      buildPluginSlashCommands([{ source: "github:acme/missing" }], []),
    ).toEqual([]);
  });

  it("dedupes a command contributed twice", () => {
    const installed = [
      makeInstalled({ name: "a", skills: [{ name: "shared:cmd" }] }),
      makeInstalled({ name: "b", skills: [{ name: "shared:cmd" }] }),
    ];
    const items = buildPluginSlashCommands(
      [{ source: "github:acme/a" }, { source: "github:acme/b" }],
      installed,
    );
    expect(items.map((i) => i.command)).toEqual(["/shared:cmd"]);
  });
});
