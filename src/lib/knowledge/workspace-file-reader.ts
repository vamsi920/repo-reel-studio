import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { getGitPath } from "#/utils/get-git-path";
import type { RepositorySnapshot } from "./knowledge-engine";

export interface SnapshotFilesResult {
  contents: Record<string, string>;
  /** Paths that failed to download — distinguishes "no relevant files" from
   * "every download failed," which the previous version of this function
   * couldn't (it swallowed every failure and returned `{}` either way). */
  failedPaths: string[];
}

/**
 * Reads real file content for a resolved repository snapshot, using the same
 * typed workspace client (`RemoteWorkspace`) this app already uses elsewhere
 * — not a second ad-hoc HTTP layer. Used by the "Watch KT" video path to
 * ground code scenes in the exact commit DeepWiki analyzed.
 */
export async function readSnapshotFiles(
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
  paths: string[],
): Promise<SnapshotFilesResult> {
  const options = getAgentServerClientOptions({
    conversationUrl,
    sessionApiKey,
    workingDir: snapshot.localPath,
  });
  const workspace = new RemoteWorkspace({
    host: options.host,
    workingDir: snapshot.localPath,
    apiKey: options.apiKey,
  });

  // `/api/file/download` rejects repository-relative paths (400) — every
  // path must be anchored to the workspace root first, exactly like
  // `use-workspace-file-content.ts` already does for the same endpoint.
  // DeepWiki's `relevantFiles[].path` is repo-relative (e.g. "src/index.ts"),
  // not the absolute sandbox path this call needs.
  const gitPath = getGitPath(undefined, snapshot.localPath);
  const workspaceRoot = gitPath.startsWith("/") ? gitPath : `/${gitPath}`;

  const failedPaths: string[] = [];
  const entries = await Promise.all(
    paths.map(async (path) => {
      try {
        const content = await workspace.downloadAsText(
          `${workspaceRoot}/${path}`,
        );
        return [path, content] as const;
      } catch {
        // A relevant file DeepWiki cited may have moved/been deleted since
        // analysis — skip it rather than fail the whole video, but record it
        // so the caller can tell "nothing relevant" apart from "every
        // download failed."
        failedPaths.push(path);
        return null;
      }
    }),
  );

  return {
    contents: Object.fromEntries(
      entries.filter((entry): entry is [string, string] => entry !== null),
    ),
    failedPaths,
  };
}
