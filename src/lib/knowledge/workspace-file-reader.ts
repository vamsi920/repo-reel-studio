import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import type { RepositorySnapshot } from "./knowledge-engine";

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
): Promise<Record<string, string>> {
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

  const entries = await Promise.all(
    paths.map(async (path) => {
      try {
        const content = await workspace.downloadAsText(path);
        return [path, content] as const;
      } catch {
        // A relevant file DeepWiki cited may have moved/been deleted since
        // analysis — skip it rather than fail the whole video.
        return null;
      }
    }),
  );

  return Object.fromEntries(
    entries.filter((entry): entry is [string, string] => entry !== null),
  );
}
