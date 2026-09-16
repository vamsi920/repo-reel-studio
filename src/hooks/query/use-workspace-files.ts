import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";

// Cap the number of files we render so a giant repo doesn't freeze the UI.
export const MAX_FILES = 2000;

// Trailing line the listing command appends so the UI can tell how many
// files the workspace really holds when the listing was cut at MAX_FILES.
const TOTAL_MARKER = "__NEO_TOTAL__";

export interface WorkspaceFilesResult {
  data: string[] | undefined;
  isLoading: boolean;
  /**
   * `data` holds only the first MAX_FILES of a larger workspace. The tab
   * must say so — a silently cut list looks like the whole workspace.
   */
  isTruncated: boolean;
  /**
   * Number of files the workspace actually holds (`data.length` unless
   * truncated). Only meaningful once `data` is defined.
   */
  totalCount: number;
  /**
   * The last fetch failed. `data` may still hold the previous successful
   * listing (a failed refresh keeps it), so callers must check both to tell
   * "couldn't load anything" from "couldn't refresh, showing stale list".
   */
  isError: boolean;
  /**
   * A (re)fetch is in flight. While true the current `data` may be an
   * out-of-date snapshot, so callers must not draw conclusions from a path
   * being absent from it.
   */
  isFetching: boolean;
  /** Re-run the listing (the Files tab's inline Retry). */
  refetch: () => void;
}

// Directory names that we never want to descend into when listing files.
const EXCLUDED_DIRS = [
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  ".next",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".turbo",
  ".parcel-cache",
  "target",
];

// Build a `find` invocation that lists files relative to the workspace root.
//
// The listing is ordered by depth first, then by path, *before* it is cut at
// MAX_FILES: a plain lexicographic `sort | head` let one large subdirectory
// (`many/f0001.txt` … `many/f2100.txt`) push every root-level file that
// sorts after it past the cap, so the workspace's own top-level files
// silently vanished. The final `awk` keeps the first MAX_FILES lines and
// appends `__NEO_TOTAL__ <n>` with the full count so the UI can say
// "showing the first 2,000 of n".
function buildListCommand(): string {
  const pruneExpr = EXCLUDED_DIRS.map((dir) => `-name '${dir}' -prune`).join(
    " -o ",
  );
  return [
    `find . \\( ${pruneExpr} \\) -o -type f -print 2>/dev/null`,
    // Prefix each path with its depth (`./a/b.txt` → `3 ./a/b.txt`).
    `awk -F/ '{ print NF " " $0 }'`,
    // Numeric on depth, then byte order on the path.
    `LC_ALL=C sort -k1,1n -k2`,
    `cut -d ' ' -f2-`,
    `awk -v max=${MAX_FILES} 'NR <= max { print } END { print "${TOTAL_MARKER} " NR }'`,
  ].join(" | ");
}

interface WorkspaceListing {
  paths: string[];
  total: number;
}

// Split the command's stdout into the (already capped) paths and the total
// count from the trailing marker line. An output without the marker (an
// older listing, or a shell that printed nothing) counts what it has.
export function parseListingOutput(stdout: string): WorkspaceListing {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const isMarker = (line: string) => line.startsWith(`${TOTAL_MARKER} `);
  const marker = lines.find(isMarker);
  const reportedTotal = marker
    ? Number.parseInt(marker.slice(TOTAL_MARKER.length + 1), 10)
    : Number.NaN;

  // Defensive: keep results unique and bounded.
  const paths = Array.from(
    new Set(lines.filter((line) => !isMarker(line)).map(normalizePath)),
  ).slice(0, MAX_FILES);
  const total = Number.isFinite(reportedTotal)
    ? Math.max(reportedTotal, paths.length)
    : paths.length;
  return { paths, total };
}

function normalizePath(path: string): string {
  // Strip a leading "./" so paths render cleanly in the UI.
  return path.startsWith("./") ? path.slice(2) : path;
}

/**
 * Local-backend listing: enumerate every regular file beneath the active
 * conversation's working directory via `find` over the agent-server's
 * `/api/bash/execute_bash_command`, excluding common heavy/build directories.
 * Returns paths relative to the working dir (e.g. `src/index.html`).
 *
 * Local only: the cloud API exposes no bash-exec / file-listing endpoint,
 * and the old cross-origin `/api/cloud-proxy` hop these calls relied on was
 * removed from the agent-server. See `useWorkspaceFiles` for the cloud path.
 */
function useLocalWorkspaceFiles(enabled: boolean): WorkspaceFilesResult {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady({ allowAgentError: true });

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  const query = useQuery<WorkspaceListing>({
    queryKey: [
      "workspace-files",
      conversationId,
      conversationUrl,
      sessionApiKey,
      workingDir,
    ],
    queryFn: async () => {
      const result = await AgentServerRuntimeService.executeCommand(
        conversationUrl,
        sessionApiKey,
        buildListCommand(),
        workingDir,
        30,
      );

      if (result.exit_code !== 0) {
        throw new Error(
          result.stderr?.trim() || "Failed to list workspace files",
        );
      }

      return parseListingOutput(result.stdout);
    },
    enabled: enabled && runtimeIsReady && !!conversationId && !!workingDir,
    retry: false,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });

  const paths = query.data?.paths;
  const total = query.data?.total ?? 0;

  return {
    data: paths,
    isLoading: query.isLoading,
    isTruncated: paths !== undefined && total > paths.length,
    totalCount: total,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: () => {
      query.refetch();
    },
  };
}

/**
 * Cloud-backend listing: derive the file list from the conversation's git
 * changes — the same data source the diff view uses (and the only
 * runtime-workspace transport the cloud API proxies, alongside git diff and
 * single-file read). `git status` reports created/modified/untracked files,
 * which covers the common Agent Canvas case (a fresh or agent-authored
 * workspace). It intentionally does NOT enumerate unchanged tracked files —
 * the cloud API has no full-workspace listing endpoint — so a conversation
 * attached to a large existing repo shows changed files rather than the whole
 * tree. Deleted files are dropped since they can't be opened.
 */
function useCloudWorkspaceFiles(enabled: boolean): WorkspaceFilesResult {
  const gitChanges = useUnifiedGetGitChanges();

  const listing = useMemo<WorkspaceListing | undefined>(() => {
    if (!enabled) return undefined;
    const paths = gitChanges.data
      .filter((change) => change.status !== "D")
      .map((change) => change.path);
    const unique = Array.from(new Set(paths));
    // `useUnifiedGetGitChanges` always hands back an array, so a request
    // that failed before anything arrived would otherwise look like an
    // empty workspace. Surface it as "no data" so the tab shows its error
    // state; a failed *refresh* keeps the previous non-empty list.
    if (gitChanges.isError && unique.length === 0) return undefined;
    return { paths: unique.slice(0, MAX_FILES), total: unique.length };
  }, [enabled, gitChanges.data, gitChanges.isError]);

  const data = enabled ? listing : undefined;
  const total = data?.total ?? 0;

  return {
    data: data?.paths,
    isLoading: enabled ? gitChanges.isLoading : false,
    isTruncated: data !== undefined && total > data.paths.length,
    totalCount: total,
    isError: enabled ? gitChanges.isError : false,
    isFetching: enabled ? gitChanges.isFetching : false,
    refetch: () => {
      gitChanges.refetch();
    },
  };
}

/**
 * Lists the files shown in the Files tab for the active conversation.
 *
 * Local backends enumerate the full workspace tree via bash `find`. Cloud
 * backends derive the list from git changes (see `useCloudWorkspaceFiles`
 * for the rationale and its limitation), because the cloud API exposes no
 * bash-exec or file-listing endpoint.
 */
export function useWorkspaceFiles(): WorkspaceFilesResult {
  const { backend } = useActiveBackend();
  const isCloud = backend.kind === "cloud";

  const local = useLocalWorkspaceFiles(!isCloud);
  const cloud = useCloudWorkspaceFiles(isCloud);

  return isCloud ? cloud : local;
}
