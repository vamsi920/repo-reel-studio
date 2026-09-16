import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import type { InstalledPluginInfo } from "#/api/plugins-management-service";
import type { SlashCommandItem } from "#/hooks/chat/use-slash-command";

/**
 * Whether a conversation's plugin reference (the client-side snapshot taken at
 * creation) points at an installed plugin. The snapshot carries the installed
 * plugin's `name` when it was auto-loaded, but a plugin attached explicitly
 * (the `/launch` flow) only carries coordinates — and its `ref` may be null
 * where the installed record stores `resolved_ref` — so fall back to matching
 * on `source` + `repo_path` rather than the full coordinate key.
 */
export function pluginMatchesInstalled(
  plugin: PluginSpec,
  installed: InstalledPluginInfo,
): boolean {
  if (plugin.name && plugin.name === installed.name) return true;
  return (
    plugin.source === installed.source &&
    (plugin.repo_path ?? "") === (installed.repo_path ?? "")
  );
}

/**
 * Slash-command items for the skills bundled in the plugins loaded into a
 * conversation. Each bundled skill (e.g. `city-weather:now`) is invokable as
 * `/<skill name>`, the same derived command `useSlashCommand` gives AgentSkills
 * without explicit triggers. Plugins the installed list doesn't know about (a
 * cloud backend, an older agent-server without the contents fields) contribute
 * nothing. Deduped by command so a plugin loaded twice lists each command once.
 */
export function buildPluginSlashCommands(
  conversationPlugins: PluginSpec[],
  installedPlugins: InstalledPluginInfo[],
): SlashCommandItem[] {
  const items: SlashCommandItem[] = [];
  const seen = new Set<string>();
  conversationPlugins.forEach((plugin) => {
    const installed = installedPlugins.find((candidate) =>
      pluginMatchesInstalled(plugin, candidate),
    );
    if (!installed) return;
    (installed.skills ?? []).forEach((skill) => {
      if (!skill.name) return;
      const command = `/${skill.name}`;
      if (seen.has(command)) return;
      seen.add(command);
      items.push({
        command,
        skill: {
          name: skill.name,
          type: "agentskills",
          source: installed.name,
          description: skill.description ?? null,
          triggers: [command],
        },
      });
    });
  });
  return items;
}
