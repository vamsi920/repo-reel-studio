import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, useParamsMock } from "test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KtVideoList from "#/routes/kt-video-list";
import { I18nKey } from "#/i18n/declaration";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { KnowledgeRepository } from "#/lib/knowledge/knowledge-engine";
import type { PageQualityFlag } from "#/lib/knowledge/quality-review";

const rehydrationChecked = vi.fn((_repositoryId?: string) => true);
vi.mock("#/lib/knowledge/use-knowledge-rehydration", () => ({
  useKnowledgeRehydration: (repositoryId?: string) =>
    rehydrationChecked(repositoryId),
}));

const REPOSITORY_ID = "acme/api@main";

function seedKnowledge(
  pages: KnowledgeRepository["pages"],
  qualityFlags: PageQualityFlag[] = [],
) {
  useKnowledgeStore.setState({
    byRepositoryId: {
      [REPOSITORY_ID]: {
        snapshot: {
          repositoryId: REPOSITORY_ID,
          owner: "acme",
          repo: "api",
          branch: "main",
          commitSha: "abcdef1234567890",
          localPath: "/workspace/api",
        },
        conversationUrl: null,
        sessionApiKey: null,
        status: "ready",
        progress: null,
        lastNonTerminalStatus: null,
        knowledge: {
          repositoryId: REPOSITORY_ID,
          commitSha: "abcdef1234567890",
          title: "Acme API",
          summary: "",
          sections: [],
          pages,
          generatedAt: new Date().toISOString(),
        },
        error: null,
        qualityFlags,
        refreshCadence: "manual",
      },
    },
  });
}

describe("KtVideoList", () => {
  beforeEach(() => {
    useParamsMock.mockReturnValue({
      repositoryId: encodeURIComponent(REPOSITORY_ID),
    } as never);
    useKnowledgeStore.setState({ byRepositoryId: {} });
    rehydrationChecked.mockReturnValue(true);
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    vi.clearAllMocks();
  });

  it("shows a loading state while rehydration is still in flight", () => {
    rehydrationChecked.mockReturnValue(false);

    renderWithProviders(<KtVideoList />);

    expect(screen.getByText(I18nKey.KT$STARTING)).toBeInTheDocument();
    expect(screen.queryByText(I18nKey.KT$NOT_FOUND)).not.toBeInTheDocument();
  });

  it("shows a not-found state once rehydration settles with nothing to show", () => {
    rehydrationChecked.mockReturnValue(true);

    renderWithProviders(<KtVideoList />);

    expect(screen.getByText(I18nKey.KT$NOT_FOUND)).toBeInTheDocument();
    expect(screen.queryByText(I18nKey.KT$STARTING)).not.toBeInTheDocument();
  });

  it("lists every page that has generated knowledge", () => {
    seedKnowledge([
      {
        id: "page-1",
        title: "Getting Started",
        description: "",
        contentMarkdown: "",
        importance: "high",
        relevantFiles: [],
        diagrams: [],
        relatedPageIds: [],
      },
      {
        id: "page-2",
        title: "Architecture",
        description: "",
        contentMarkdown: "",
        importance: "medium",
        relevantFiles: [],
        diagrams: [],
        relatedPageIds: [],
      },
    ]);

    renderWithProviders(<KtVideoList />);

    const items = screen.getAllByTestId("kt-video-list-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Getting Started");
    expect(items[1]).toHaveTextContent("Architecture");
  });

  it("shows a quality-flag badge for a flagged page but not for an unflagged one", () => {
    seedKnowledge(
      [
        {
          id: "page-1",
          title: "Getting Started",
          description: "",
          contentMarkdown: "",
          importance: "high",
          relevantFiles: [],
          diagrams: [],
          relatedPageIds: [],
        },
        {
          id: "page-2",
          title: "Architecture",
          description: "",
          contentMarkdown: "",
          importance: "medium",
          relevantFiles: [],
          diagrams: [],
          relatedPageIds: [],
        },
      ],
      [
        {
          pageId: "page-1",
          kind: "no-citations",
          detail: "Page 1 cites no source files.",
        },
      ],
    );

    renderWithProviders(<KtVideoList />);

    const items = screen.getAllByTestId("kt-video-list-item");
    expect(
      items[0].querySelector(
        `[aria-label="${I18nKey.KT$QUALITY_FLAG_BADGE}"]`,
      ),
    ).toBeInTheDocument();
    expect(
      items[1].querySelector(
        `[aria-label="${I18nKey.KT$QUALITY_FLAG_BADGE}"]`,
      ),
    ).not.toBeInTheDocument();
  });

  it("navigates to the watch view for the selected page", async () => {
    seedKnowledge([
      {
        id: "page-1",
        title: "Getting Started",
        description: "",
        contentMarkdown: "",
        importance: "high",
        relevantFiles: [],
        diagrams: [],
        relatedPageIds: [],
      },
    ]);
    const navigate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<KtVideoList />, { navigation: { navigate } });
    await user.click(screen.getByTestId("kt-video-list-item"));

    expect(navigate).toHaveBeenCalledWith(
      `/kt/${encodeURIComponent(REPOSITORY_ID)}/page-1?view=watch`,
    );
  });

  it("navigates back to the repository list", async () => {
    const navigate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<KtVideoList />, { navigation: { navigate } });
    await user.click(screen.getByText(I18nKey.KT$BACK_TO_LIST));

    expect(navigate).toHaveBeenCalledWith("/kt");
  });
});
