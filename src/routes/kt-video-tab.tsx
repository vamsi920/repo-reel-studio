import { useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Film, Volume2, VolumeX } from "lucide-react";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { buildKtManifest } from "#/lib/kt-video/build-manifest";
import { useSceneNarration } from "#/lib/kt-video/use-scene-narration";
import { KtVideoComposition } from "#/components/features/kt-video/kt-video-composition";

/* eslint-disable i18next/no-literal-string -- KT video tab chrome pending full i18n pass */

const MAX_SELECTABLE_FILES = 8;

/** Fetches text content for a bounded set of workspace files, keyed by path. */
export function useSelectedFileContents(paths: string[]): {
  contents: Record<string, string>;
  isLoading: boolean;
} {
  // Hook-count is stable across renders for a fixed MAX_SELECTABLE_FILES —
  // we always call the same number of hooks, just with null paths for
  // unused slots, which use-workspace-file-content treats as disabled.
  // Keyed on the serialized path list rather than the `paths` array
  // reference: the caller (KtVideoTab's `effectiveSelected`) recomputes a
  // fresh array on every render even when the selection hasn't changed, so
  // a reference-keyed memo here would never actually stay stable.
  const pathsKey = JSON.stringify(paths);
  const slots = useMemo(() => {
    const padded = [...paths];
    while (padded.length < MAX_SELECTABLE_FILES) padded.push("");
    return padded.slice(0, MAX_SELECTABLE_FILES);
  }, [pathsKey]);

  const results = [
    useWorkspaceFileContent(slots[0] || null),
    useWorkspaceFileContent(slots[1] || null),
    useWorkspaceFileContent(slots[2] || null),
    useWorkspaceFileContent(slots[3] || null),
    useWorkspaceFileContent(slots[4] || null),
    useWorkspaceFileContent(slots[5] || null),
    useWorkspaceFileContent(slots[6] || null),
    useWorkspaceFileContent(slots[7] || null),
  ];

  // `results` is a fresh array every render (react-query returns a new
  // result object whenever any field changes), but each entry's `.data` is
  // referentially stable across renders where the fetched content hasn't
  // changed. Keying the memo on the actual `.data` values (rather than
  // rebuilding `contents` as a plain object literal every render) keeps
  // `contents` — and therefore the manifest built from it downstream —
  // referentially stable across unrelated re-renders. Without this, every
  // background refetch/poll elsewhere in the tree rebuilds the manifest and
  // retriggers `useSceneNarration`'s effect, which cancels and restarts
  // in-progress narration audio.
  const contents = useMemo(() => {
    const out: Record<string, string> = {};
    slots.forEach((path, i) => {
      const result = results[i];
      if (path && result.data?.kind === "text" && result.data.text != null) {
        out[path] = result.data.text;
      }
    });
    return out;
  }, [
    slots,
    results[0].data,
    results[1].data,
    results[2].data,
    results[3].data,
    results[4].data,
    results[5].data,
    results[6].data,
    results[7].data,
  ]);

  const isLoading = slots.some((path, i) => path && results[i].isLoading);

  return { contents, isLoading };
}

function KtVideoTab() {
  const { data: conversation } = useActiveConversation();
  const gitChanges = useUnifiedGetGitChanges();
  const workspaceFiles = useWorkspaceFiles();

  const changedPaths = useMemo(
    () =>
      gitChanges.data
        .filter((change) => change.status !== "D")
        .map((change) => change.path),
    [gitChanges.data],
  );

  const allPaths = workspaceFiles.data ?? [];
  const [selected, setSelected] = useState<string[] | null>(null);
  const effectiveSelected =
    selected ?? changedPaths.slice(0, MAX_SELECTABLE_FILES);

  const { contents, isLoading: filesLoading } =
    useSelectedFileContents(effectiveSelected);

  const manifest = useMemo(
    () =>
      buildKtManifest(
        conversation?.selected_repository?.split("/").pop() || "this repo",
        contents,
        MAX_SELECTABLE_FILES,
      ),
    [conversation?.selected_repository, contents],
  );

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const base = prev ?? changedPaths.slice(0, MAX_SELECTABLE_FILES);
      if (base.includes(path)) return base.filter((p) => p !== path);
      if (base.length >= MAX_SELECTABLE_FILES) return base;
      return [...base, path];
    });
  };

  const durationInFrames = Math.max(1, manifest.totalFrames);

  const playerRef = useRef<PlayerRef>(null);
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  useSceneNarration(manifest, playerRef, narrationEnabled && speechSupported);

  return (
    <main
      className="flex h-full w-full flex-col items-stretch overflow-hidden"
      data-testid="kt-video-tab"
    >
      <div className="flex items-center gap-2 border-b border-[var(--oh-border)] px-3 py-2">
        <Film className="size-4 text-[var(--oh-muted)]" aria-hidden />
        <span className="text-sm font-medium text-[var(--oh-foreground)]">
          KT Video
        </span>
        <span className="text-xs text-[var(--oh-muted)]">
          Deterministic walkthrough, rendered from real files — pick up to{" "}
          {MAX_SELECTABLE_FILES}
        </span>
        <button
          type="button"
          onClick={() => setNarrationEnabled((v) => !v)}
          disabled={!speechSupported}
          aria-pressed={narrationEnabled}
          title={
            speechSupported
              ? "Read each scene's narration aloud as it plays"
              : "Speech synthesis isn't available in this browser"
          }
          data-testid="kt-video-narration-toggle"
          className="ml-auto flex items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-2 py-1 text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {narrationEnabled ? (
            <Volume2 className="size-3.5" aria-hidden />
          ) : (
            <VolumeX className="size-3.5" aria-hidden />
          )}
          Narration
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-[var(--oh-border)] p-2 custom-scrollbar-always">
          {workspaceFiles.isLoading ? (
            <p className="px-2 py-1 text-xs text-[var(--oh-muted)]">
              Loading files…
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {(changedPaths.length ? changedPaths : allPaths)
                .slice(0, 200)
                .map((path) => {
                  const isChecked = effectiveSelected.includes(path);
                  return (
                    <li key={path}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleFile(path)}
                        />
                        <span className="truncate" title={path}>
                          {path}
                        </span>
                      </label>
                    </li>
                  );
                })}
            </ul>
          )}
        </aside>

        <div className="flex flex-1 min-w-0 items-center justify-center bg-black p-4">
          {filesLoading || effectiveSelected.length === 0 ? (
            <p className="text-sm text-[var(--oh-muted)]">
              {effectiveSelected.length === 0
                ? "Select files on the left to generate a KT video."
                : "Loading file content…"}
            </p>
          ) : (
            <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-lg shadow-2xl">
              <Player
                ref={playerRef}
                component={KtVideoComposition}
                inputProps={{ manifest }}
                durationInFrames={durationInFrames}
                compositionWidth={1920}
                compositionHeight={1080}
                fps={manifest.fps}
                style={{ width: "100%", height: "100%" }}
                controls
                loop
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default KtVideoTab;
