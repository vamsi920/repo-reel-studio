import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSelectedFileContents } from "#/routes/kt-video-tab";

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
});
