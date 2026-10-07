import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useKtWorkspaceSync } from "#/hooks/use-kt-workspace-sync";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { KT_KNOWLEDGE } from "../lib/knowledge/kt-fixtures";

vi.mock("#/hooks/query/use-active-conversation");
vi.mock("#/hooks/use-runtime-is-ready");

const executeCommand = vi.fn();
vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    executeCommand: (...args: unknown[]) => executeCommand(...args),
  },
}));

const loadPersistedKnowledge = vi.fn();
vi.mock("#/lib/knowledge/persisted-knowledge", () => ({
  loadPersistedKnowledge: (...args: unknown[]) =>
    loadPersistedKnowledge(...args),
}));

const CONVERSATION = {
  id: "c1",
  conversation_url: "http://runtime/api/conversations/c1",
  session_api_key: "key",
  workspace: { working_dir: "/workspace/repos/acme/shop" },
  selected_repository: "acme/shop",
  selected_branch: "main",
};

function writes() {
  return executeCommand.mock.calls
    .map(([, , command]) => command as string)
    .filter((command) => command.includes("base64 -d"));
}

describe("useKtWorkspaceSync", () => {
  beforeEach(() => {
    executeCommand.mockReset();
    loadPersistedKnowledge.mockReset();
    useKnowledgeStore.setState({ byRepositoryId: {} });
    vi.mocked(useActiveConversation).mockReturnValue({
      data: CONVERSATION,
    } as unknown as ReturnType<typeof useActiveConversation>);
    vi.mocked(useRuntimeIsReady).mockReturnValue(true);
  });

  it("writes KT docs loaded from Supabase when the folder has none", async () => {
    loadPersistedKnowledge.mockResolvedValue({
      status: "found",
      knowledge: KT_KNOWLEDGE,
    });
    executeCommand.mockResolvedValue({ exit_code: 0, stdout: "" });

    renderHook(() => useKtWorkspaceSync());

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    expect(loadPersistedKnowledge).toHaveBeenCalledWith("acme", "shop", "main");
    expect(executeCommand.mock.calls[0][3]).toBe("/workspace/repos/acme/shop");
  });

  it("leaves docs alone when they already describe the same commit", async () => {
    loadPersistedKnowledge.mockResolvedValue({
      status: "found",
      knowledge: KT_KNOWLEDGE,
    });
    executeCommand.mockResolvedValue({
      exit_code: 0,
      stdout: JSON.stringify({ commitSha: KT_KNOWLEDGE.commitSha }),
    });

    renderHook(() => useKtWorkspaceSync());

    await waitFor(() => expect(executeCommand).toHaveBeenCalled());
    expect(writes()).toHaveLength(0);
  });

  it("does nothing until the runtime is ready", () => {
    vi.mocked(useRuntimeIsReady).mockReturnValue(false);

    renderHook(() => useKtWorkspaceSync());

    expect(loadPersistedKnowledge).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
