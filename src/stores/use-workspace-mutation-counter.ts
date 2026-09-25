import { create } from "zustand";

/**
 * Monotonic counter that ticks every time the agent commits a file-editor
 * mutation in the workspace. Serves two purposes:
 *
 *   1. It's part of the {@link useWorkspaceFileContent} query key, so the
 *      hook refetches the selected file's body (used for text decoding /
 *      binary classification) after each edit even when the selected path
 *      hasn't moved.
 *   2. It's appended as a `?v=<count>` cache-buster to the static
 *      workspace fileserver URLs used by `<iframe src>` / `<img src>` for
 *      the rich preview, so the browser re-requests a fresh copy after
 *      each edit — important because the rendered HTML may reference
 *      sibling assets (CSS, images) that the user can't see directly but
 *      expects to reflect the latest version of the workspace.
 *
 * Consumers:
 *   - {@link useAutoRefreshFilesOnEdit} bumps this on each mutation event.
 *   - {@link useWorkspaceFileContent} reads the count via its query key so
 *     the hook refetches after each edit.
 *   - `FileContentViewer` / files-tab "open in new tab" link append the
 *     count to the static URL via {@link withWorkspaceCacheBuster}.
 */
interface WorkspaceMutationCounterState {
  count: number;
  bump: () => void;
}

export const useWorkspaceMutationCounter =
  create<WorkspaceMutationCounterState>((set) => ({
    count: 0,
    bump: () => set((state) => ({ count: state.count + 1 })),
  }));

/**
 * Append the current mutation counter as a `v=<n>` query parameter so the
 * browser refetches the URL after every agent-side edit. Returns `null` if
 * the input is `null` so callers can pass through optional URLs untouched.
 *
 * `data:` URIs (the cloud backend's `staticUrl` — see the cloud branch of
 * `useWorkspaceFileContent`) are returned unchanged rather than having the
 * query param appended: a `data:` URI's whole content after the comma is
 * literal payload bytes, not a request the browser re-issues, so `?v=N`
 * would land *inside* the base64 data and corrupt it (an invalid payload
 * that fails to decode instead of a refreshed image/PDF/iframe). They
 * don't need busting anyway — the mutation counter is already part of
 * `useWorkspaceFileContent`'s query key, so every edit produces a brand
 * new `data:` string encoding the latest bytes directly.
 */
export function withWorkspaceCacheBuster(url: string, version: number): string;
export function withWorkspaceCacheBuster(
  url: string | null,
  version: number,
): string | null;
export function withWorkspaceCacheBuster(
  url: string | null,
  version: number,
): string | null {
  if (url === null || url.startsWith("data:")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${version}`;
}
