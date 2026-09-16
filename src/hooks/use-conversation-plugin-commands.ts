import { useMemo } from "react";
import { useConversationPlugins } from "#/hooks/use-conversation-plugins";
import { usePlugins } from "#/hooks/query/use-plugins";
import { buildPluginSlashCommands } from "#/utils/plugin-slash-commands";

/**
 * Slash commands contributed by the plugins loaded into the active
 * conversation, resolved against the installed-plugins list (the only source
 * of a plugin's bundled skills). Empty outside a conversation, on a cloud
 * backend, or while the installed list is still loading — the composer's slash
 * menu appends them once they arrive.
 */
export function useConversationPluginCommands() {
  const conversationPlugins = useConversationPlugins();
  const { data: installedPlugins } = usePlugins();
  return useMemo(
    () => buildPluginSlashCommands(conversationPlugins, installedPlugins ?? []),
    [conversationPlugins, installedPlugins],
  );
}
