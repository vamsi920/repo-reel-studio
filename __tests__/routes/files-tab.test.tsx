/* eslint-disable react/jsx-props-no-spreading */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";

import FilesTab from "#/routes/files-tab";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { WorkspaceFileReadError } from "#/hooks/query/use-workspace-file-content";
import { NavigationProvider } from "#/context/navigation-context";

// Mocks must be declared before the SUT is imported.
const useHasAttachedSourceMock = vi.fn();
const useHasGitCommitsMock = vi.fn();
const useUnifiedGitCommitsMock = vi.fn();
const useWorkspaceFilesMock = vi.fn();
const useWorkspaceFileContentMock = vi.fn();
const refetchGitChangesMock = vi.fn();
const refetchFilesMock = vi.fn();

vi.mock("#/hooks/use-has-attached-source", () => ({
  useHasAttachedSource: () => useHasAttachedSourceMock(),
}));

vi.mock("#/hooks/query/use-has-git-commits", () => ({
  useHasGitCommits: (opts?: { enabled?: boolean }) =>
    useHasGitCommitsMock(opts),
}));

vi.mock("#/hooks/query/use-unified-git-commits", () => ({
  useUnifiedGitCommits: () => useUnifiedGitCommitsMock(),
}));

vi.mock("#/hooks/query/use-workspace-files", () => ({
  useWorkspaceFiles: () => useWorkspaceFilesMock(),
}));

vi.mock("#/hooks/query/use-workspace-file-content", async (importOriginal) => ({
  // Keep the real WorkspaceFileReadError so the tab's "file is gone"
  // reconcile (an instanceof check) can be exercised below.
  ...(await importOriginal<
    typeof import("#/hooks/query/use-workspace-file-content")
  >()),
  useWorkspaceFileContent: (path: string | null) =>
    useWorkspaceFileContentMock(path),
}));

vi.mock("#/hooks/query/use-unified-get-git-changes", () => ({
  useUnifiedGetGitChanges: () => ({
    refetch: refetchGitChangesMock,
    isFetching: false,
  }),
}));

vi.mock("#/routes/changes-tab", () => ({
  default: () => <div data-testid="changes-tab-content">Diff View</div>,
}));

vi.mock("#/routes/commits-tab", () => ({
  default: () => <div data-testid="commits-tab-content">Commits View</div>,
}));

function renderTab(conversationId: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <NavigationProvider
        value={{
          currentPath: "/",
          conversationId,
          isNavigating: false,
          navigate: () => {},
        }}
      >
        <QueryClientProvider client={client}>
          <FilesTab />
        </QueryClientProvider>
      </NavigationProvider>
    </MemoryRouter>,
  );
}

describe("FilesTab", () => {
  beforeEach(() => {
    // `selectedPath` lives in a global Zustand store (useFilesTabStore) and
    // the auto-select effect re-fires when the store is reset between tests,
    // which can race with the Zustand mock's afterEach reset and leave the
    // store polluted with the previous test's path. Resetting here, after
    // the previous test's cleanup() has unmounted any FilesTab, defeats
    // that race so each test starts with a clean selection.
    useFilesTabStore.setState({
      selectedPath: null,
      selectedConversationId: null,
    });

    useHasAttachedSourceMock.mockReset();
    useHasGitCommitsMock.mockReset();
    useUnifiedGitCommitsMock.mockReset();
    useWorkspaceFilesMock.mockReset();
    useWorkspaceFileContentMock.mockReset();
    refetchGitChangesMock.mockReset();
    refetchFilesMock.mockReset();
    // Default: pretend the probe has already resolved with at least one
    // commit. Individual tests can override this for "empty repo" cases.
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: true,
      isLoading: false,
    });
    // Default: the agent server supports the commits API (the third toggle
    // segment is offered) but the conversation has no commits yet.
    useUnifiedGitCommitsMock.mockReturnValue({
      commits: [],
      hasMore: false,
      isUnsupported: false,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
    });

    useWorkspaceFilesMock.mockReturnValue({
      data: ["index.html", "src/main.ts", "README.md"],
      isLoading: false,
      isError: false,
      refetch: refetchFilesMock,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "index.html",
        kind: "text",
        text: "<!doctype html><html><body>hello</body></html>",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/index.html",
        mimeType: "text/html",
      },
      isLoading: false,
      isError: false,
    });
  });

  it("defaults to diff view when the user attached a source (repo or workspace)", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });

    renderTab();

    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();
    // The Rich/Plain toggle is hidden when diff view is active.
    expect(
      screen.queryByTestId("files-tab-content-mode-toggle"),
    ).not.toBeInTheDocument();
  });

  it("defaults to files+rich view when the attached source has no commits (non-git workspace or unborn HEAD)", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: false,
      isLoading: false,
    });

    renderTab();

    // Even though something is attached, the diff view is suppressed when
    // there's nothing to diff against.
    expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("files-tab-content-mode-toggle"),
    ).toBeInTheDocument();
  });

  it("does NOT probe for commits when no source is attached", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    // The hook is still called (so the diff toggle has a value), but it
    // must be called with enabled: false so we don't shell out to the
    // workspace pointlessly.
    expect(useHasGitCommitsMock).toHaveBeenCalledWith({ enabled: false });
  });

  it("optimistically defaults to diff view while the attachment / has-commits probes are still loading", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: null,
      isLoading: true,
    });

    renderTab();

    // The common case is a repo with commits, so to avoid a files→diff
    // flash on initial mount we lean diff-view while loading.
    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();
  });

  it("defaults to plain file viewer when no source is attached", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    // Tree is collapsed by default — user expands via the caret.
    expect(screen.queryByTestId("files-tab-tree")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("files-tab-content-mode-toggle"),
    ).toBeInTheDocument();
  });

  it("lets users toggle diff view off even when a source is attached", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });
    const user = userEvent.setup();

    renderTab();

    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();

    // Click the "Files" segment of the diff-view toggle.
    await user.click(screen.getByTestId("files-tab-diff-toggle-option-off"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("changes-tab-content"),
      ).not.toBeInTheDocument();
    });
    // Quick-row toggle exists and the file-viewer area is shown.
    expect(
      screen.getByTestId("file-quick-row-tree-toggle"),
    ).toBeInTheDocument();
  });

  it("auto-selects the highest-priority file on first render", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    // Either index.html (top-priority entrypoint) should be selected.
    expect(useWorkspaceFileContentMock).toHaveBeenCalledWith("index.html");
  });

  it("renders the binary fallback in plain mode for binary files", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "logo.png",
        kind: "binary",
        text: null,
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/logo.png",
        mimeType: "application/octet-stream",
      },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderTab();

    await user.click(
      screen.getByTestId("files-tab-content-mode-toggle-option-plain"),
    );

    expect(
      screen.getByTestId("file-content-viewer-binary-fallback"),
    ).toBeInTheDocument();
  });

  it("shows full file paths (not just basenames) as quick-row pills", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    // The pill for src/main.ts should display the full relative path.
    const pill = screen.getByTestId("file-quick-row-item-src/main.ts");
    expect(pill).toHaveTextContent("src/main.ts");
  });

  it("collapses the file tree by default and expands it via the caret", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    const user = userEvent.setup();

    renderTab();

    // Hidden by default.
    expect(screen.queryByTestId("files-tab-tree")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("file-quick-row-tree-toggle"));
    expect(screen.getByTestId("files-tab-tree")).toBeInTheDocument();

    await user.click(screen.getByTestId("file-quick-row-tree-toggle"));
    expect(screen.queryByTestId("files-tab-tree")).not.toBeInTheDocument();
  });

  it("renders markdown content via MarkdownRenderer in rich mode", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    // Only expose a markdown file so it is auto-selected as the first
    // priority entry.
    useWorkspaceFilesMock.mockReturnValue({
      data: ["README.md"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "README.md",
        kind: "text",
        text: "# Hello\n\nSome **bold** text",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/README.md",
        mimeType: "text/markdown",
      },
      isLoading: false,
      isError: false,
    });

    renderTab();

    await waitFor(() => {
      expect(
        screen.getByTestId("file-content-viewer-markdown"),
      ).toBeInTheDocument();
    });

    // react-markdown turns "# Hello" into an <h1>.
    expect(
      screen.getByRole("heading", { level: 1, name: "Hello" }),
    ).toBeInTheDocument();
    expect(screen.getByText("bold").tagName.toLowerCase()).toBe("strong");
    // Markdown rendering uses MarkdownRenderer, not an iframe.
    expect(
      screen.queryByTestId("file-content-viewer-iframe"),
    ).not.toBeInTheDocument();
    // The rich-rendered markdown container is mounted.
    expect(
      screen.getByTestId("file-content-viewer-markdown"),
    ).toBeInTheDocument();
  });

  it("shows highlighted source (not rich markdown) when toggled to plain on a .md", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    useWorkspaceFilesMock.mockReturnValue({
      data: ["README.md"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "README.md",
        kind: "text",
        text: "# Hello\n\nSome **bold** text",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/README.md",
        mimeType: "text/markdown",
      },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderTab();

    // Toggle to plain — markdown source should now be syntax-highlighted
    // as `markdown`, not rendered.
    await user.click(
      screen.getByTestId("files-tab-content-mode-toggle-option-plain"),
    );

    const highlighted = await screen.findByTestId(
      "file-content-viewer-highlighted",
    );
    expect(highlighted.getAttribute("data-language")).toBe("markdown");
    // Confirm the rich-rendered <h1> is gone.
    expect(
      screen.queryByRole("heading", { level: 1, name: "Hello" }),
    ).not.toBeInTheDocument();
  });

  it("uses the workspace fileserver URL as the iframe src for HTML files", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    useWorkspaceFilesMock.mockReturnValue({
      data: ["index.html"],
      isLoading: false,
    });
    const staticUrl =
      "https://agent.example.com/api/conversations/conv-1/workspace/index.html";
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "index.html",
        kind: "text",
        text: "<!doctype html><body>hi</body>",
        staticUrl,
        mimeType: "text/html",
      },
      isLoading: false,
      isError: false,
    });

    renderTab();

    const iframe = await screen.findByTestId("file-content-viewer-iframe");
    expect(iframe).toBeInTheDocument();
    // The iframe src points at the workspace fileserver so relative
    // asset references (`<link href="style.css">` etc.) resolve to
    // sibling files. The `?v=<mutation-counter>` suffix is the
    // cache-buster appended by the viewer so the browser re-fetches
    // after each agent-side edit.
    expect(iframe).toHaveAttribute("src", `${staticUrl}?v=0`);
    // The iframe is sandboxed with `allow-same-origin` only: `<script>` /
    // inline event handlers inside the previewed file are inert. We deliberately
    // do NOT add `allow-scripts` — a workspace HTML file's scripts must not run
    // in the canvas's context.
    expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
  });

  it("switches between rich and plain content modes", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    // Only `src/main.ts` is exposed so it auto-selects (otherwise the
    // priority sort picks `index.html` first and the assertion below
    // would see the markup grammar instead).
    useWorkspaceFilesMock.mockReturnValue({
      data: ["src/main.ts"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "src/main.ts",
        kind: "text",
        text: "console.log('hi');",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/src/main.ts",
        mimeType: "text/plain",
      },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderTab();

    await user.click(
      screen.getByTestId("files-tab-content-mode-toggle-option-plain"),
    );
    // `src/main.ts` resolves to a Prism grammar (`typescript`), so the
    // plain view is a syntax-highlighted source view rather than a raw
    // `<pre>`. We assert the highlighted container and its data-language
    // attribute as a regression guard.
    const highlighted = await screen.findByTestId(
      "file-content-viewer-highlighted",
    );
    expect(highlighted).toBeInTheDocument();
    expect(highlighted.getAttribute("data-language")).toBe("typescript");
  });

  it("announces the workspace listing as loading via role=status while it resolves", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    useWorkspaceFilesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: refetchFilesMock,
    });

    renderTab();

    // `role="status"` lets a screen reader announce this state instead of
    // leaving the pane silently blank while the listing is still in flight.
    expect(screen.getByRole("status")).toHaveTextContent(
      "FILES$LOADING_FILES",
    );
    expect(screen.queryByTestId("files-tab-list-error")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("files-tab-content"),
    ).not.toBeInTheDocument();
  });

  it("shows the refresh button inside the files-tab toolbar and triggers a refetch", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    const user = userEvent.setup();

    renderTab();

    const refresh = screen.getByTestId("files-tab-refresh");
    expect(refresh).toBeInTheDocument();
    // The button should describe its *action* (refresh), not the surrounding
    // section name ("Files") — the old `COMMON$FILES` aria-label was
    // ambiguous for screen-reader users who couldn't see the refresh icon.
    expect(refresh).toHaveAttribute("aria-label", "FILES$REFRESH");
    await user.click(refresh);
    expect(refetchGitChangesMock).toHaveBeenCalledTimes(1);
  });

  // A failed workspace listing must be visibly different from an empty
  // workspace, and the user must have a way to retry that re-runs the
  // listing itself (not just the git-changes refetch the toolbar fires).
  describe("file list load errors", () => {
    beforeEach(() => {
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: false,
        isLoading: false,
      });
    });

    it("replaces the list with an alert + Retry when the listing failed with no data", async () => {
      useWorkspaceFilesMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: refetchFilesMock,
      });
      const user = userEvent.setup();

      renderTab();

      const alert = screen.getByTestId("files-tab-list-error");
      expect(alert).toHaveAttribute("role", "alert");
      expect(
        within(alert).getByText("FILES$LIST_LOAD_ERROR"),
      ).toBeInTheDocument();
      // Nothing that looks like an (empty) workspace is rendered.
      expect(
        screen.queryByTestId("files-tab-list-stale"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("FILES$NO_FILES")).not.toBeInTheDocument();
      expect(
        screen.queryByText("FILES$NO_FILE_SELECTED"),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId("files-tab-list-retry"));
      expect(refetchFilesMock).toHaveBeenCalledTimes(1);
      expect(refetchGitChangesMock).not.toHaveBeenCalled();
    });

    it("keeps the previous list but flags it as stale when a refresh failed", async () => {
      useWorkspaceFilesMock.mockReturnValue({
        data: ["index.html", "src/main.ts"],
        isLoading: false,
        isError: true,
        refetch: refetchFilesMock,
      });
      const user = userEvent.setup();

      renderTab();

      const notice = screen.getByTestId("files-tab-list-stale");
      expect(notice).toHaveAttribute("role", "alert");
      expect(
        within(notice).getByText("FILES$LIST_REFRESH_ERROR"),
      ).toBeInTheDocument();
      // The stale list is still usable underneath the notice.
      expect(
        screen.getByTestId("file-quick-row-item-index.html"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("files-tab-list-error"),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId("files-tab-list-stale-retry"));
      expect(refetchFilesMock).toHaveBeenCalledTimes(1);
    });

    it("shows neither error state when the listing succeeded", () => {
      renderTab();

      expect(
        screen.queryByTestId("files-tab-list-error"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("files-tab-list-stale"),
      ).not.toBeInTheDocument();
    });
  });

  describe("capped file list", () => {
    beforeEach(() => {
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: false,
        isLoading: false,
      });
    });

    it("says how many files are hidden when the listing was cut", () => {
      useWorkspaceFilesMock.mockReturnValue({
        data: ["index.html", "many/f0001.txt"],
        isLoading: false,
        isError: false,
        isTruncated: true,
        totalCount: 2113,
        refetch: refetchFilesMock,
      });

      renderTab();

      const notice = screen.getByTestId("files-tab-list-truncated");
      expect(notice).toHaveAttribute("role", "status");
      expect(
        within(notice).getByText("FILES$LIST_TRUNCATED"),
      ).toBeInTheDocument();
      // The capped list stays usable underneath the notice.
      expect(
        screen.getByTestId("file-quick-row-item-index.html"),
      ).toBeInTheDocument();
    });

    it("shows no notice when the whole workspace is listed", () => {
      renderTab();

      expect(
        screen.queryByTestId("files-tab-list-truncated"),
      ).not.toBeInTheDocument();
    });
  });

  // Regression coverage for issue #1350: a file selected in one conversation
  // must not survive into another. The selection is global (Zustand) but
  // scoped to its conversation; the files tab ignores a path owned by a
  // different conversation so it never tries to open a file that only exists
  // in the previous conversation's workspace.
  describe("conversation switching", () => {
    beforeEach(() => {
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: false,
        isLoading: false,
      });
    });

    it("ignores a stale selection from another conversation and auto-selects this conversation's file", async () => {
      // demo.html was opened in conversation A and only exists there.
      useFilesTabStore.setState({
        selectedPath: "demo.html",
        selectedConversationId: "conv-a",
      });
      // Conversation B's workspace does not contain demo.html.
      useWorkspaceFilesMock.mockReturnValue({
        data: ["app.html"],
        isLoading: false,
      });

      renderTab("conv-b");

      // The stale demo.html is never requested; B auto-selects its own file.
      await waitFor(() => {
        expect(useWorkspaceFileContentMock).toHaveBeenCalledWith("app.html");
      });
      expect(useWorkspaceFileContentMock).not.toHaveBeenCalledWith("demo.html");

      // The store ownership flips to the active conversation.
      await waitFor(() => {
        const state = useFilesTabStore.getState();
        expect(state.selectedPath).toBe("app.html");
        expect(state.selectedConversationId).toBe("conv-b");
      });
    });

    it("preserves a selection that belongs to the current conversation (explicit navigate_to_file)", async () => {
      // canvas_ui navigated this conversation to report.html outside React.
      useFilesTabStore.setState({
        selectedPath: "report.html",
        selectedConversationId: "conv-b",
      });
      useWorkspaceFilesMock.mockReturnValue({
        data: ["report.html", "app.html"],
        isLoading: false,
      });

      renderTab("conv-b");

      // The explicit selection is honored and auto-select does not override it.
      await waitFor(() => {
        expect(useWorkspaceFileContentMock).toHaveBeenCalledWith("report.html");
      });
      expect(useFilesTabStore.getState().selectedPath).toBe("report.html");
    });

    it("drops the selection when the tab switches to a different conversation", async () => {
      useWorkspaceFilesMock.mockReturnValue({
        data: ["demo.html"],
        isLoading: false,
      });

      const { rerender } = renderTab("conv-a");

      // Conversation A auto-selects and owns demo.html.
      await waitFor(() => {
        expect(useFilesTabStore.getState().selectedPath).toBe("demo.html");
      });
      expect(useFilesTabStore.getState().selectedConversationId).toBe("conv-a");

      // Switch the mounted tab to conversation B, whose workspace has app.html.
      useWorkspaceFileContentMock.mockClear();
      useWorkspaceFilesMock.mockReturnValue({
        data: ["app.html"],
        isLoading: false,
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      rerender(
        <MemoryRouter>
          <NavigationProvider
            value={{
              currentPath: "/",
              conversationId: "conv-b",
              isNavigating: false,
              navigate: () => {},
            }}
          >
            <QueryClientProvider client={client}>
              <FilesTab />
            </QueryClientProvider>
          </NavigationProvider>
        </MemoryRouter>,
      );

      // After the switch the tab follows B and never re-requests demo.html.
      await waitFor(() => {
        expect(useFilesTabStore.getState().selectedPath).toBe("app.html");
      });
      expect(useFilesTabStore.getState().selectedConversationId).toBe("conv-b");
      expect(useWorkspaceFileContentMock).not.toHaveBeenCalledWith("demo.html");
    });
  });

  describe("selected file deleted by the agent", () => {
    // The agent ran `rm one.txt`: the content query now 404s and the
    // refreshed listing no longer contains the file.
    function selectGoneFile(listing: string[], isFetching = false) {
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: false,
        isLoading: false,
      });
      useFilesTabStore.setState({
        selectedPath: "one.txt",
        selectedConversationId: "conv-b",
      });
      useWorkspaceFilesMock.mockReturnValue({
        data: listing,
        isLoading: false,
        isError: false,
        isFetching,
        refetch: refetchFilesMock,
      });
      useWorkspaceFileContentMock.mockImplementation((path: string | null) =>
        path === "one.txt"
          ? {
              data: undefined,
              isLoading: false,
              isError: true,
              error: new WorkspaceFileReadError("one.txt", 404),
            }
          : {
              data: {
                path,
                kind: "text",
                text: "hello",
                staticUrl: `http://localhost:3000/api/conversations/c1/workspace/${path}`,
                mimeType: "text/plain",
              },
              isLoading: false,
              isError: false,
            },
      );
    }

    it("falls back to the highest-priority remaining file once the listing no longer has it", async () => {
      selectGoneFile(["notes/two.txt", "README.md"]);

      renderTab("conv-b");

      await waitFor(() => {
        expect(useFilesTabStore.getState().selectedPath).toBe("README.md");
      });
      expect(useFilesTabStore.getState().selectedConversationId).toBe("conv-b");
      // The viewer and the open-in-new-window link follow the new selection.
      expect(
        screen.getByTestId("files-tab-open-in-new-window"),
      ).toHaveAttribute("href", expect.stringContaining("README.md"));
      expect(
        screen.queryByTestId("file-content-viewer-error"),
      ).not.toBeInTheDocument();
    });

    it("shows the empty state when the deleted file was the last one", async () => {
      selectGoneFile([]);

      renderTab("conv-b");

      await waitFor(() => {
        expect(useFilesTabStore.getState().selectedPath).toBeNull();
      });
    });

    it("keeps the selection while the listing is still refetching", async () => {
      selectGoneFile(["README.md"], true);

      renderTab("conv-b");

      // Give the effects a tick to (not) fire.
      await waitFor(() => {
        expect(useWorkspaceFileContentMock).toHaveBeenCalledWith("one.txt");
      });
      expect(useFilesTabStore.getState().selectedPath).toBe("one.txt");
    });

    it("keeps a file that 404s but is still listed (read failure, not a delete)", async () => {
      selectGoneFile(["one.txt", "README.md"]);

      renderTab("conv-b");

      await waitFor(() => {
        expect(useWorkspaceFileContentMock).toHaveBeenCalledWith("one.txt");
      });
      expect(useFilesTabStore.getState().selectedPath).toBe("one.txt");
    });
  });

  describe("commits view", () => {
    it("offers the Commits toggle option when the server supports the commits API", () => {
      // Arrange — beforeEach default: commits supported.
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: true,
        isLoading: false,
      });

      // Act
      renderTab();

      // Assert
      expect(
        screen.getByTestId("files-tab-diff-toggle-option-commits"),
      ).toBeInTheDocument();
    });

    it("hides the Commits toggle option against an older agent server", () => {
      // Arrange — the commits endpoint 404'd: server too old.
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: true,
        isLoading: false,
      });
      useUnifiedGitCommitsMock.mockReturnValue({
        commits: [],
        hasMore: false,
        isUnsupported: true,
        isLoading: false,
        isFetching: false,
        isSuccess: true,
        isError: false,
      });

      // Act
      renderTab();

      // Assert
      expect(
        screen.queryByTestId("files-tab-diff-toggle-option-commits"),
      ).not.toBeInTheDocument();
    });

    it("renders the Commits option between Diff and Files", () => {
      // Arrange — beforeEach default: commits supported.
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: true,
        isLoading: false,
      });

      // Act
      renderTab();

      // Assert — Commits sits beside Diff, ahead of Files: Diff → Commits → Files.
      const toggle = screen.getByTestId("files-tab-diff-toggle");
      const order = within(toggle)
        .getAllByRole("radio")
        .map((option) => option.getAttribute("data-testid"));
      expect(order).toEqual([
        "files-tab-diff-toggle-option-on",
        "files-tab-diff-toggle-option-commits",
        "files-tab-diff-toggle-option-off",
      ]);
    });

    it("switches the panel to the commits view when the Commits option is selected", async () => {
      // Arrange
      const user = userEvent.setup();
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: true,
        isLoading: false,
      });
      renderTab();

      // Act
      await user.click(
        screen.getByTestId("files-tab-diff-toggle-option-commits"),
      );

      // Assert — the commits view replaces the diff view; the file-browser
      // controls (Rich/Plain) stay hidden.
      expect(screen.getByTestId("commits-tab-content")).toBeInTheDocument();
      expect(
        screen.queryByTestId("changes-tab-content"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("files-tab-content-mode-toggle"),
      ).not.toBeInTheDocument();
    });

    it("does not carry the commits selection over to a different conversation switched to in-place", async () => {
      // Arrange — mount on conversation A with the Commits option selected.
      const user = userEvent.setup();
      useHasAttachedSourceMock.mockReturnValue({
        hasAttachedSource: true,
        isLoading: false,
      });
      const { rerender } = renderTab("conv-a");

      await user.click(
        screen.getByTestId("files-tab-diff-toggle-option-commits"),
      );
      expect(screen.getByTestId("commits-tab-content")).toBeInTheDocument();

      // Act — switch the mounted tab (no remount) to conversation B, whose
      // agent server also supports the commits API.
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      rerender(
        <MemoryRouter>
          <NavigationProvider
            value={{
              currentPath: "/",
              conversationId: "conv-b",
              isNavigating: false,
              navigate: () => {},
            }}
          >
            <QueryClientProvider client={client}>
              <FilesTab />
            </QueryClientProvider>
          </NavigationProvider>
        </MemoryRouter>,
      );

      // Assert — conversation B lands on its own default view, not commits.
      await waitFor(() => {
        expect(
          screen.queryByTestId("commits-tab-content"),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();
    });
  });
});
