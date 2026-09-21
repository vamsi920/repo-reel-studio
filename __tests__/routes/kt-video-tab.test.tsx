import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import KtVideoTab, { useSelectedFileContents } from "#/routes/kt-video-tab";
import type { GitChange } from "#/api/open-hands.types";

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
});
