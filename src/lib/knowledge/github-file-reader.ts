import { mintGithubCloneToken } from "#/api/git-service/mint-local-github-clone-credential";
import type { RepositorySnapshot } from "./knowledge-engine";
import type { SnapshotFilesResult } from "./workspace-file-reader";

const MAX_CONCURRENT = 6;

function apiBase(host: string): string {
  return host === "github.com"
    ? "https://api.github.com"
    : `https://${host}/api/v3`;
}

/**
 * Reads files straight from GitHub at the snapshot's exact commit, for
 * Knowledge entries that came back from Supabase with no live conversation
 * (no agent-server workspace to read from). Public repositories need no
 * token; a locally connected GitHub account is used when one exists so
 * private repositories work too. Never throws: unreadable files are listed
 * in `failedPaths`, the same contract as `readSnapshotFiles`.
 */
export async function readGithubFiles(
  snapshot: RepositorySnapshot,
  paths: string[],
): Promise<SnapshotFilesResult> {
  const failedPaths: string[] = [];
  const contents: Record<string, string> = {};
  if (snapshot.owner === "local" || !snapshot.commitSha || paths.length === 0) {
    return { contents, failedPaths: [...paths] };
  }

  const credential = await mintGithubCloneToken({
    evenIfNotFlaggedConnected: true,
  }).catch(() => null);
  const base = apiBase(credential?.host ?? "github.com");
  const headers: Record<string, string> = {
    accept: "application/vnd.github.raw+json",
  };
  if (credential?.token) headers.authorization = `Bearer ${credential.token}`;

  let next = 0;
  const work = async () => {
    while (next < paths.length) {
      const path = paths[next];
      next += 1;
      try {
        const encoded = path.split("/").map(encodeURIComponent).join("/");
        const response = await fetch(
          `${base}/repos/${encodeURIComponent(snapshot.owner)}/${encodeURIComponent(snapshot.repo)}/contents/${encoded}?ref=${encodeURIComponent(snapshot.commitSha)}`,
          { headers },
        );
        if (!response.ok) throw new Error(String(response.status));
        contents[path] = await response.text();
      } catch {
        failedPaths.push(path);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, paths.length) }, work),
  );
  return { contents, failedPaths };
}
