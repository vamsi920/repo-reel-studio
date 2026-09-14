import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KtList from "#/routes/kt-list";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RepoCandidate } from "#/lib/knowledge/connected-repositories";

const connected: RepoCandidate[] = [];
let connectedLoading = false;
const listGeneratedRepositories = vi.fn();

vi.mock("#/lib/knowledge/connected-repositories", () => ({
  useConnectedRepositories: () => ({
    repositories: connected,
    isLoading: connectedLoading,
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
    connectedLoading = false;
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

  it("shows a loading placeholder, not the empty state, until the persisted lookup settles", async () => {
    let resolveList: (value: never[]) => void = () => {};
    listGeneratedRepositories.mockReturnValue(
      new Promise<never[]>((resolve) => {
        resolveList = resolve;
      }),
    );

    renderWithProviders(<KtList />);

    // The Supabase round trip is still in flight: the "no repositories"
    // copy must not be committed even for a frame.
    expect(screen.getByTestId("kt-list-loading")).toBeInTheDocument();
    expect(screen.queryByText("KT$EMPTY")).toBeNull();

    resolveList([]);

    expect(await screen.findByText("KT$EMPTY")).toBeInTheDocument();
    expect(screen.queryByTestId("kt-list-loading")).toBeNull();
  });

  it("keeps the loading placeholder while conversation history is still loading", async () => {
    connectedLoading = true;
    listGeneratedRepositories.mockResolvedValue([]);

    renderWithProviders(<KtList />);

    await waitFor(() =>
      expect(listGeneratedRepositories).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByTestId("kt-list-loading")).toBeInTheDocument();
    expect(screen.queryByText("KT$EMPTY")).toBeNull();
  });

  it("falls through to the empty state when the persisted lookup fails and nothing is connected", async () => {
    listGeneratedRepositories.mockRejectedValue(new Error("no supabase"));

    renderWithProviders(<KtList />);

    expect(await screen.findByText("KT$EMPTY")).toBeInTheDocument();
    expect(screen.queryByTestId("kt-list-loading")).toBeNull();
  });

  it("renders persisted repositories as View Knowledge cards without an empty-state flash", async () => {
    listGeneratedRepositories.mockResolvedValue([
      { owner: "vamsi920", repo: "layman", branch: "main" },
    ]);

    renderWithProviders(<KtList />);

    expect(screen.queryByText("KT$EMPTY")).toBeNull();
    expect(await screen.findByTestId("kt-repo-card")).toHaveTextContent(
      "vamsi920/layman",
    );
    expect(screen.getByText("KT$VIEW_KNOWLEDGE")).toBeInTheDocument();
    expect(screen.queryByText("KT$EMPTY")).toBeNull();
  });
});
