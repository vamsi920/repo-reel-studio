import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PluginsManagementService, {
  type InstalledPluginInfo,
} from "#/api/plugins-management-service";
import { setStoredConversationMetadata } from "#/api/conversation-metadata-store";
import { NavigationProvider } from "#/context/navigation-context";
import { useConversationPluginCommands } from "#/hooks/use-conversation-plugin-commands";

vi.mock("#/api/plugins-management-service", () => ({
  __esModule: true,
  default: { listInstalledPlugins: vi.fn() },
}));

const CONVERSATION_ID = "convo-plugins-1";

function buildInstalledPlugin(
  overrides: Partial<InstalledPluginInfo> = {},
): InstalledPluginInfo {
  return {
    name: "city-weather",
    version: "1.0.0",
    description: null,
    enabled: true,
    source: "github:OpenHands/extensions",
    resolved_ref: null,
    repo_path: "plugins/city-weather",
    installed_at: "2026-06-01T00:00:00Z",
    install_path: "/home/.openhands/plugins/installed/city-weather",
    skills: [{ name: "city-weather:now", description: "Current weather" }],
    ...overrides,
  };
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NavigationProvider
          value={{
            currentPath: `/conversations/${CONVERSATION_ID}`,
            conversationId: CONVERSATION_ID,
            isNavigating: false,
            navigate: vi.fn(),
          }}
        >
          {children}
        </NavigationProvider>
      </QueryClientProvider>
    );
  };
};

describe("useConversationPluginCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns no commands outside a conversation route or before plugins are loaded", () => {
    vi.mocked(PluginsManagementService.listInstalledPlugins).mockResolvedValue(
      [buildInstalledPlugin()],
    );

    const { result } = renderHook(() => useConversationPluginCommands(), {
      wrapper: createWrapper(),
    });

    // No stored metadata for this conversation yet, and/or the installed
    // list query hasn't resolved -- either way the composer's slash menu
    // must not show a command for a plugin that isn't actually loaded.
    expect(result.current).toEqual([]);
  });

  it("resolves the loaded conversation's plugins against the installed list into slash commands", async () => {
    setStoredConversationMetadata(CONVERSATION_ID, {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      plugins: [
        { source: "github:OpenHands/extensions", ref: null, repo_path: "plugins/city-weather" },
      ],
    });
    vi.mocked(PluginsManagementService.listInstalledPlugins).mockResolvedValue(
      [buildInstalledPlugin()],
    );

    const { result } = renderHook(() => useConversationPluginCommands(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });
    expect(result.current[0]).toMatchObject({
      command: "/city-weather:now",
      skill: { name: "city-weather:now", source: "city-weather" },
    });
  });

  it("contributes nothing for a plugin the installed list doesn't recognize", async () => {
    setStoredConversationMetadata(CONVERSATION_ID, {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      plugins: [
        { source: "github:someone/unrelated", ref: null, repo_path: null },
      ],
    });
    vi.mocked(PluginsManagementService.listInstalledPlugins).mockResolvedValue(
      [buildInstalledPlugin()],
    );

    const { result } = renderHook(() => useConversationPluginCommands(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(PluginsManagementService.listInstalledPlugins).toHaveBeenCalled();
    });
    expect(result.current).toEqual([]);
  });
});
