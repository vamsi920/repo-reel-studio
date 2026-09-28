import { describe, expect, it } from "vitest";
import {
  buildPluginsViewModel,
  matchesPluginSearch,
  matchesPluginStatus,
} from "#/components/features/plugins/build-plugins-view-model";
import type { MarketplacePlugin, LocalPlugin } from "#/api/plugins-service";
import type { InstalledPluginInfo } from "#/api/plugins-management-service";

const catalogPlugin: MarketplacePlugin = {
  name: "demo-plugin",
  description: "Catalog description",
  source: "github:OpenHands/extensions",
  ref: null,
  repo_path: "plugins/demo-plugin",
  installed: false,
};

const installedPlugin: InstalledPluginInfo = {
  name: "demo-plugin",
  version: "2.0.0",
  description: "Installed description",
  enabled: false,
  source: "github:OpenHands/extensions",
  resolved_ref: "main",
  repo_path: "plugins/demo-plugin",
  installed_at: "2026-06-01T00:00:00Z",
  install_path: "/home/.openhands/plugins/installed/demo-plugin",
};

const localPlugin: LocalPlugin = {
  name: "ambient-plugin",
  version: "1.0.0",
  description: "Ambient description",
};

describe("buildPluginsViewModel", () => {
  it("merges a plugin present in both the catalog and the installed list into one installed entry", () => {
    const result = buildPluginsViewModel([catalogPlugin], [installedPlugin]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      installed: true,
      inCatalog: true,
      enabled: false,
      version: "2.0.0",
      description: "Installed description",
    });
  });

  it("falls back to the catalog description when the installed entry has none", () => {
    const result = buildPluginsViewModel(
      [catalogPlugin],
      [{ ...installedPlugin, description: null }],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      description: "Catalog description",
    });
  });

  it("marks a catalog-only plugin as not installed", () => {
    const result = buildPluginsViewModel([catalogPlugin], []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      installed: false,
      inCatalog: true,
    });
  });

  it("keeps an installed plugin that is absent from the catalog", () => {
    const result = buildPluginsViewModel([], [installedPlugin]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      installed: true,
      inCatalog: false,
      enabled: false,
    });
  });

  it("adds a locally-discovered plugin as a read-only local entry", () => {
    const result = buildPluginsViewModel([], [], [localPlugin]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "ambient-plugin",
      isLocal: true,
      installed: false,
      inCatalog: false,
      version: "1.0.0",
    });
  });

  it("does not add a separate local entry when the plugin is already installed", () => {
    const result = buildPluginsViewModel(
      [],
      [installedPlugin],
      [{ ...localPlugin, name: installedPlugin.name }],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      installed: true,
      isLocal: false,
    });
  });

  it("classifies a local plugin under the local filter and not the available filter", () => {
    const [local] = buildPluginsViewModel([], [], [localPlugin]);

    expect(matchesPluginStatus(local, "local")).toBe(true);
    expect(matchesPluginStatus(local, "available")).toBe(false);
  });

  it("prefers the installed copy's contents over the catalog's", () => {
    const result = buildPluginsViewModel(
      [
        {
          ...catalogPlugin,
          path: "/cache/plugins/demo-plugin",
          skills: [{ name: "catalog-skill" }],
          files: ["catalog.md"],
        },
      ],
      [
        {
          ...installedPlugin,
          skills: [{ name: "installed-skill" }],
          files: ["installed.md"],
        },
      ],
    );

    expect(result[0]).toMatchObject({
      path: installedPlugin.install_path,
      skills: [{ name: "installed-skill" }],
      files: ["installed.md"],
    });
  });

  it("falls back to the catalog's contents when the installed entry has none", () => {
    const result = buildPluginsViewModel(
      [
        {
          ...catalogPlugin,
          path: "/cache/plugins/demo-plugin",
          skills: [{ name: "catalog-skill" }],
          files: ["catalog.md"],
        },
      ],
      [installedPlugin],
    );

    expect(result[0]).toMatchObject({
      path: "/cache/plugins/demo-plugin",
      skills: [{ name: "catalog-skill" }],
      files: ["catalog.md"],
    });
  });

  it("sorts installed plugins first, then local, then available, alphabetically within each group", () => {
    const installedB: InstalledPluginInfo = {
      ...installedPlugin,
      name: "zeta-installed",
    };
    const installedA: InstalledPluginInfo = {
      ...installedPlugin,
      name: "alpha-installed",
    };
    const localB: LocalPlugin = { ...localPlugin, name: "zeta-local" };
    const localA: LocalPlugin = { ...localPlugin, name: "alpha-local" };
    const availableB: MarketplacePlugin = {
      ...catalogPlugin,
      name: "zeta-available",
    };
    const availableA: MarketplacePlugin = {
      ...catalogPlugin,
      name: "alpha-available",
    };

    const result = buildPluginsViewModel(
      [availableB, availableA],
      [installedB, installedA],
      [localB, localA],
    );

    expect(result.map((plugin) => plugin.name)).toEqual([
      "alpha-installed",
      "zeta-installed",
      "alpha-local",
      "zeta-local",
      "alpha-available",
      "zeta-available",
    ]);
  });

  it("carries a local plugin's contents into its entry", () => {
    const result = buildPluginsViewModel(
      [],
      [],
      [
        {
          ...localPlugin,
          path: "/home/.agents/plugins/ambient-plugin",
          skills: [{ name: "ambient-skill" }],
          files: ["SKILL.md"],
        },
      ],
    );

    expect(result[0]).toMatchObject({
      path: "/home/.agents/plugins/ambient-plugin",
      skills: [{ name: "ambient-skill" }],
      files: ["SKILL.md"],
    });
  });
});

describe("matchesPluginSearch", () => {
  const [plugin] = buildPluginsViewModel([catalogPlugin], [installedPlugin]);

  it("matches everything when the query is empty or whitespace-only", () => {
    expect(matchesPluginSearch(plugin, "")).toBe(true);
    expect(matchesPluginSearch(plugin, "   ")).toBe(true);
  });

  it("matches case-insensitively against name, description, source, repoPath, and ref", () => {
    expect(matchesPluginSearch(plugin, "DEMO-plugin")).toBe(true);
    expect(matchesPluginSearch(plugin, "installed description")).toBe(true);
    expect(matchesPluginSearch(plugin, "openhands/extensions")).toBe(true);
    expect(matchesPluginSearch(plugin, "plugins/demo-plugin")).toBe(true);
    expect(matchesPluginSearch(plugin, "MAIN")).toBe(true);
  });

  it("returns false when no field contains the query", () => {
    expect(matchesPluginSearch(plugin, "nonexistent-term")).toBe(false);
  });

  it("does not throw when optional fields are null", () => {
    const [bare] = buildPluginsViewModel(
      [],
      [
        {
          ...installedPlugin,
          description: null,
          resolved_ref: null,
          repo_path: null,
        },
      ],
    );

    expect(matchesPluginSearch(bare, "demo")).toBe(true);
    expect(matchesPluginSearch(bare, "anything-else")).toBe(false);
  });
});
