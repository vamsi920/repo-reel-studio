import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KtList from "#/routes/kt-list";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RepoCandidate } from "#/lib/knowledge/connected-repositories";

const connected: RepoCandidate[] = [];
const listGeneratedRepositories = vi.fn();

vi.mock("#/lib/knowledge/connected-repositories", () => ({
  useConnectedRepositories: () => ({
    repositories: connected,
    isLoading: false,
  }),
  resolveCommitSha: vi.fn(),
}));

vi.mock("#/lib/knowledge/generate-knowledge", () => ({
  generateKnowledge: vi.fn(),
}));

vi.mock("#/lib/knowledge/conversation-provisioning", () => ({
  waitForWorkspaceReady: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/knowledge-repository", () => ({
  knowledgePersistenceRepository: {
    listGeneratedRepositories: () => listGeneratedRepositories(),
  },
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { id: "local" }, orgId: null }),
}));

vi.mock("#/components/features/home/open-repository-dialog", () => ({
  OpenRepositoryDialog: () => null,
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
}));

function setConnected(...candidates: RepoCandidate[]) {
  connected.splice(0, connected.length, ...candidates);
}

const UNPROVISIONED: RepoCandidate = {
  repositoryId: "acme/api@main",
  owner: "acme",
  repo: "api",
  branch: "main",
  conversationUrl: null,
  sessionApiKey: null,
  workingDir: null,
};

describe("KtList", () => {
  beforeEach(() => {
    setConnected();
    useKnowledgeStore.setState({
      byRepositoryId: {},
      provisioningByRepositoryId: {},
    });
    listGeneratedRepositories.mockResolvedValue([]);
  });

  afterEach(() => {
    useKnowledgeStore.setState({
      byRepositoryId: {},
      provisioningByRepositoryId: {},
    });
    vi.clearAllMocks();
  });

  it("keeps a failed generation visible on the card", async () => {
    setConnected(UNPROVISIONED);
    const user = userEvent.setup();

    renderWithProviders(<KtList />);
    await user.click(await screen.findByTestId("kt-generate-button"));

    // The knowledge store has no entry for this repository yet, so the
    // store's own error state can't hold this message.
    expect(await screen.findByTestId("kt-generate-error")).toHaveTextContent(
      /hasn't finished provisioning yet/,
    );
  });

  it("still lists connected repositories when the persisted lookup fails", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onUnhandled);
    setConnected(UNPROVISIONED);
    listGeneratedRepositories.mockRejectedValue(new Error("no supabase"));

    try {
      renderWithProviders(<KtList />);

      expect(await screen.findByTestId("kt-repo-card")).toBeInTheDocument();
      await waitFor(() => expect(rejections).toHaveLength(0));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
