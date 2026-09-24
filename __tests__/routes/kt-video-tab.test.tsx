import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KtVideoTab, { useSelectedFileContents } from "#/routes/kt-video-tab";
import type { GitChange } from "#/api/open-hands.types";
import { useConversationStore } from "#/stores/conversation-store";

const { fileResultsMock } = vi.hoisted(() => ({
  fileResultsMock: new Map<
    string,
    { isLoading: boolean; data: { kind: string; text: string | null } }
  >(),
}));

vi.mock("#/hooks/query/use-workspace-file-content", () => ({
  useWorkspaceFileContent: (path: string | null) => {
    if (!path) return { isLoading: false, data: undefined };
    return fileResultsMock.get(path) ?? { isLoading: false, data: undefined };
  },
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({ data: undefined }),
}));

const gitChangesMock = vi.fn();
vi.mock("#/hooks/query/use-unified-get-git-changes", () => ({
  useUnifiedGetGitChanges: () => gitChangesMock(),
}));

const workspaceFilesMock = vi.fn();
vi.mock("#/hooks/query/use-workspace-files", () => ({
  useWorkspaceFiles: () => workspaceFilesMock(),
}));

vi.mock("@remotion/player", () => ({
  Player: () => null,
}));

describe("useSelectedFileContents", () => {
  it("keeps the same contents object across re-renders when the underlying file data hasn't changed", () => {
    fileResultsMock.set("a.ts", {
      isLoading: false,
      data: { kind: "text", text: "export const a = 1;" },
    });
    fileResultsMock.set("b.ts", {
      isLoading: false,
      data: { kind: "text", text: "export const b = 2;" },
    });

    const { result, rerender } = renderHook(
      ({ paths }: { paths: string[] }) => useSelectedFileContents(paths),
      { initialProps: { paths: ["a.ts", "b.ts"] } },
    );

    expect(result.current.contents).toEqual({
      "a.ts": "export const a = 1;",
      "b.ts": "export const b = 2;",
    });
    const firstContents = result.current.contents;

    // Re-render with an unrelated prop change (same paths) — simulates a
    // parent re-render triggered by something else in the tree (e.g. a
    // background query poll), where the file contents themselves are
    // unchanged. A rebuilt-every-render `contents` object would break
    // downstream memoization (the KT-video manifest, and in turn
    // useSceneNarration's effect, which would tear down and restart
    // narration audio on every such re-render).
    rerender({ paths: ["a.ts", "b.ts"] });

    expect(result.current.contents).toBe(firstContents);
  });

  it("rebuilds contents once the underlying file data actually changes", () => {
    fileResultsMock.set("a.ts", {
      isLoading: false,
      data: { kind: "text", text: "v1" },
    });

    const { result, rerender } = renderHook(
      ({ paths }: { paths: string[] }) => useSelectedFileContents(paths),
      { initialProps: { paths: ["a.ts"] } },
    );

    expect(result.current.contents).toEqual({ "a.ts": "v1" });
    const firstContents = result.current.contents;

    fileResultsMock.set("a.ts", {
      isLoading: false,
      data: { kind: "text", text: "v2" },
    });
    rerender({ paths: ["a.ts"] });

    expect(result.current.contents).toEqual({ "a.ts": "v2" });
    expect(result.current.contents).not.toBe(firstContents);
  });

  it("reports isLoading only for selected slots that are still loading", () => {
    fileResultsMock.set("a.ts", {
      isLoading: true,
      data: undefined as unknown as { kind: string; text: string | null },
    });

    const { result } = renderHook(() => useSelectedFileContents(["a.ts"]));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.contents).toEqual({});
  });

  it("does not report a still-loading file as unavailable", () => {
    fileResultsMock.set("a.ts", {
      isLoading: true,
      data: undefined as unknown as { kind: string; text: string | null },
    });

    const { result } = renderHook(() => useSelectedFileContents(["a.ts"]));

    expect(result.current.unavailablePaths.has("a.ts")).toBe(false);
  });

  it("reports a selected file as unavailable once it settles with a read error", () => {
    fileResultsMock.set("missing.ts", {
      isLoading: false,
      data: undefined as unknown as { kind: string; text: string | null },
    });

    const { result } = renderHook(() =>
      useSelectedFileContents(["missing.ts"]),
    );

    expect(result.current.unavailablePaths.has("missing.ts")).toBe(true);
    expect(result.current.contents).toEqual({});
  });

  it("reports a selected binary file as unavailable rather than silently dropping it", () => {
    fileResultsMock.set("logo.png", {
      isLoading: false,
      data: { kind: "image", text: null },
    });

    const { result } = renderHook(() => useSelectedFileContents(["logo.png"]));

    expect(result.current.unavailablePaths.has("logo.png")).toBe(true);
    expect(result.current.contents).toEqual({});
  });

  it("reports a selected file that loaded as empty/whitespace-only text as unavailable rather than silently dropping it", () => {
    fileResultsMock.set("empty.ts", {
      isLoading: false,
      data: { kind: "text", text: "   \n  " },
    });

    const { result } = renderHook(() =>
      useSelectedFileContents(["empty.ts"]),
    );

    expect(result.current.unavailablePaths.has("empty.ts")).toBe(true);
  });

  it("does not report a successfully loaded text file as unavailable", () => {
    fileResultsMock.set("a.ts", {
      isLoading: false,
      data: { kind: "text", text: "export const a = 1;" },
    });

    const { result } = renderHook(() => useSelectedFileContents(["a.ts"]));

    expect(result.current.unavailablePaths.has("a.ts")).toBe(false);
  });
});

function renderKtVideoTab(paths: string[]) {
  const gitChanges: GitChange[] = paths.map((path) => ({
    status: "M",
    path,
  }));
  gitChangesMock.mockReturnValue({ data: gitChanges, isFetching: false });
  workspaceFilesMock.mockReturnValue({ data: [], isLoading: false });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <KtVideoTab />
    </QueryClientProvider>,
  );
}

describe("KtVideoTab file selection cap", () => {
  afterEach(() => {
    useConversationStore.setState({ ktVideoSelectedFiles: null });
  });

  it("disables and titles an unselected checkbox once 8 files are already picked, and re-enables it when a slot frees up", async () => {
    const paths = Array.from({ length: 9 }, (_, i) => `file-${i}.ts`);
    const user = userEvent.setup();
    renderKtVideoTab(paths);

    // The first 8 changed files are pre-selected by default, leaving the
    // 9th at the cap with no room to add it.
    const ninthLabel = screen.getByTitle("file-8.ts").closest("label")!;
    const ninthCheckbox = within(ninthLabel).getByRole(
      "checkbox",
    ) as HTMLInputElement;
    expect(ninthCheckbox).toBeDisabled();
    expect(ninthLabel).toHaveAttribute(
      "title",
      "KT$VIDEO_TAB_FILE_LIMIT_REACHED",
    );

    const firstLabel = screen.getByTitle("file-0.ts").closest("label")!;
    const firstCheckbox = within(firstLabel).getByRole(
      "checkbox",
    ) as HTMLInputElement;
    expect(firstCheckbox).not.toBeDisabled();
    expect(firstCheckbox).toBeChecked();

    // Freeing a slot re-enables the previously capped checkbox.
    await user.click(firstCheckbox);
    expect(ninthCheckbox).not.toBeDisabled();
    expect(ninthLabel).not.toHaveAttribute("title");
  });

  it("keeps the user's manual file picks after the tab unmounts and remounts, like switching away and back", async () => {
    // More than the cap, so the default selection (the first 8 changed
    // files) differs from what we're about to manually pick.
    const paths = Array.from({ length: 9 }, (_, i) => `file-${i}.ts`);
    const user = userEvent.setup();
    const { unmount } = renderKtVideoTab(paths);

    // file-0.ts is checked by default; manually uncheck it, and check the
    // otherwise-unreachable file-8.ts in the slot it frees up.
    const firstLabel = screen.getByTitle("file-0.ts").closest("label")!;
    const firstCheckbox = within(firstLabel).getByRole(
      "checkbox",
    ) as HTMLInputElement;
    expect(firstCheckbox).toBeChecked();
    await user.click(firstCheckbox);
    expect(firstCheckbox).not.toBeChecked();

    const ninthLabel = screen.getByTitle("file-8.ts").closest("label")!;
    const ninthCheckbox = within(ninthLabel).getByRole(
      "checkbox",
    ) as HTMLInputElement;
    await user.click(ninthCheckbox);
    expect(ninthCheckbox).toBeChecked();

    // Simulate ConversationTabContent unmounting this tab's subtree when the
    // user switches to another tab, then remounting it on switching back.
    unmount();
    renderKtVideoTab(paths);

    const remountedFirstLabel = screen
      .getByTitle("file-0.ts")
      .closest("label")!;
    expect(within(remountedFirstLabel).getByRole("checkbox")).not.toBeChecked();

    const remountedNinthLabel = screen
      .getByTitle("file-8.ts")
      .closest("label")!;
    expect(within(remountedNinthLabel).getByRole("checkbox")).toBeChecked();
  });
});

describe("KtVideoTab file availability", () => {
  afterEach(() => {
    useConversationStore.setState({ ktVideoSelectedFiles: null });
  });

  it("shows an unavailable badge next to a selected file that failed to load, and none for one that loaded fine", () => {
    fileResultsMock.set("available.ts", {
      isLoading: false,
      data: { kind: "text", text: "export const a = 1;" },
    });
    fileResultsMock.set("broken.bin", {
      isLoading: false,
      data: { kind: "image", text: null },
    });
    renderKtVideoTab(["available.ts", "broken.bin"]);

    const brokenLabel = screen.getByTitle("broken.bin").closest("label")!;
    expect(
      within(brokenLabel).getByText("KT$VIDEO_TAB_FILE_UNAVAILABLE"),
    ).toBeInTheDocument();

    const availableLabel = screen.getByTitle("available.ts").closest("label")!;
    expect(
      within(availableLabel).queryByText("KT$VIDEO_TAB_FILE_UNAVAILABLE"),
    ).not.toBeInTheDocument();
  });
});

describe("KtVideoTab file listing empty/error states", () => {
  afterEach(() => {
    useConversationStore.setState({ ktVideoSelectedFiles: null });
  });

  function renderWithFileListing(opts: {
    gitChanges?: Record<string, unknown>;
    workspaceFiles?: Record<string, unknown>;
  }) {
    gitChangesMock.mockReturnValue({
      data: [],
      isFetching: false,
      ...opts.gitChanges,
    });
    workspaceFilesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      ...opts.workspaceFiles,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <KtVideoTab />
      </QueryClientProvider>,
    );
  }

  it("shows a real empty-workspace message instead of a blank sidebar when there are genuinely no files", () => {
    renderWithFileListing({});

    expect(screen.getByText("KT$VIDEO_TAB_NO_FILES")).toBeInTheDocument();
  });

  it("shows an error with retry instead of an indistinguishable blank sidebar when the workspace listing failed", async () => {
    const refetch = vi.fn();
    const user = userEvent.setup();
    renderWithFileListing({
      workspaceFiles: { data: undefined, isError: true, refetch },
    });

    expect(screen.queryByText("KT$VIDEO_TAB_NO_FILES")).not.toBeInTheDocument();
    const retryButton = screen.getByTestId("files-tab-list-retry");
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("still lists changed files even when the full workspace listing failed", () => {
    renderWithFileListing({
      gitChanges: { data: [{ status: "M", path: "changed.ts" }] },
      workspaceFiles: { data: undefined, isError: true },
    });

    expect(screen.getByTitle("changed.ts")).toBeInTheDocument();
    expect(
      screen.queryByTestId("files-tab-list-retry"),
    ).not.toBeInTheDocument();
  });
});

describe("KtVideoTab narration toggle", () => {
  afterEach(() => {
    useConversationStore.setState({ ktVideoSelectedFiles: null });
    vi.unstubAllGlobals();
  });

  it("disables the narration toggle and explains why when speech synthesis isn't available", () => {
    renderKtVideoTab(["a.ts"]);

    const toggle = screen.getByTestId("kt-video-narration-toggle");
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("title", "KT$NARRATION_TOOLTIP_UNSUPPORTED");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects the narration toggle's on/off state through aria-pressed when speech synthesis is available", async () => {
    // The toggle is disabled without this -- `speechSupported` is a plain
    // `"speechSynthesis" in window` check in the component. Unlike
    // kt-page.test.tsx, `useSceneNarration` isn't mocked here, so the stub
    // needs the methods its real effects actually call (`cancel` fires as
    // soon as `narrationEnabled` flips, even with no player attached yet).
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn(),
      paused: false,
      speaking: false,
    });
    const user = userEvent.setup();
    renderKtVideoTab(["a.ts"]);

    const toggle = screen.getByTestId("kt-video-narration-toggle");
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute("title", "KT$NARRATION_TOOLTIP_ENABLED");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
