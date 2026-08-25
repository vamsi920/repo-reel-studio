/**
 * Drives CodeGraph analysis from the browser, but runs the work in the
 * agent-server sandbox where the repository checkout already lives.
 *
 * The flow is: upload the prebuilt analyzer payload next to the checkout, run
 * it with `executeCommand`, then read the sharded results back with
 * `downloadAsText`. This is the same shape DeepWiki already uses (it reads the
 * sandbox checkout in `type: "local"` mode) — see
 * `docs/deepwiki-video-kt-integration.md` §3.
 *
 * Doing the parsing in the browser instead would mean pulling every analyzed
 * file over HTTP one at a time; on a 2,500-file repository that is thousands of
 * round trips before the first node renders.
 */
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { artifactStore } from "#/lib/data-platform/artifact-store";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import type {
  CodeGraphLevel,
  CodeGraphMeta,
  CodeGraphCrumb,
} from "./codegraph-types";
import type { SubsystemHint } from "./hierarchy";
import { shardName } from "./shard-name";

/**
 * Where the analyzer payload and its output live, relative to the workspace.
 *
 * Always resolve this through `inWorkspace()` before handing it to the SDK:
 * the agent-server's `/api/file/upload` and `/api/file/download` endpoints take
 * the path verbatim and reject anything relative with
 * `400 {"detail":"Path must be absolute"}` — the SDK does not prepend
 * `workingDir` for you.
 */
const ANALYZER_DIR = ".neodevex/codegraph";

/** Joins a workspace-relative path onto the workspace root. */
export function inWorkspace(localPath: string, relative: string): string {
  const root = localPath.replace(/\/+$/, "");
  const rest = relative.replace(/^\/+/, "");
  return `${root}/${rest}`;
}

/** Served from `public/`, produced by `scripts/build-codegraph-analyzer.mjs`. */
const PAYLOAD_BASE = "/codegraph-analyzer";

export interface AnalyzerManifest {
  entry: string;
  runtime: string[];
  grammars: string[];
}

export interface CodeGraphLevelPayload extends CodeGraphLevel {
  crumbs: CodeGraphCrumb[];
}

export type AnalyzerPhase =
  | "analyzing"
  | "relationships"
  | "mapped"
  | "ready"
  | "failed";

export interface AnalyzerProgress {
  phase: AnalyzerPhase;
  fileCount?: number;
  symbolCount?: number;
  subsystemCount?: number;
  reason?: string;
}

export class CodeGraphAnalyzerError extends Error {
  readonly stage: string;

  constructor(stage: string, message: string) {
    super(message);
    this.name = "CodeGraphAnalyzerError";
    this.stage = stage;
  }
}

function workspaceFor(
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
): RemoteWorkspace {
  const options = getAgentServerClientOptions({
    conversationUrl,
    sessionApiKey,
    workingDir: snapshot.localPath,
  });
  return new RemoteWorkspace({
    host: options.host,
    workingDir: snapshot.localPath,
    apiKey: options.apiKey,
  });
}

/** Shell-quotes a path so a workspace path containing spaces still works. */
function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Confirms the sandbox can actually run the analyzer before we spend time
 * uploading ~8 MB of grammars into it.
 */
export async function probeSandbox(
  workspace: RemoteWorkspace,
): Promise<{ ok: true; nodeVersion: string } | { ok: false; reason: string }> {
  try {
    const result = await workspace.executeCommand(
      "node --version",
      undefined,
      30,
    );
    const version = (result.stdout ?? "").trim();
    if (result.exit_code !== 0 || !version.startsWith("v")) {
      return { ok: false, reason: "node is not available in this workspace" };
    }
    const major = Number(version.slice(1).split(".")[0]);
    if (Number.isFinite(major) && major < 18) {
      return { ok: false, reason: `node ${version} is too old (need 18+)` };
    }
    return { ok: true, nodeVersion: version };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function uploadPayload(
  workspace: RemoteWorkspace,
  localPath: string,
  manifest: AnalyzerManifest,
): Promise<void> {
  const files = [manifest.entry, ...manifest.runtime, ...manifest.grammars];
  const analyzerDir = inWorkspace(localPath, ANALYZER_DIR);

  const dirs = new Set<string>();
  for (const file of files) {
    const slash = file.lastIndexOf("/");
    if (slash > 0) dirs.add(`${analyzerDir}/${file.slice(0, slash)}`);
  }
  const mkdir = await workspace.executeCommand(
    `mkdir -p ${[analyzerDir, ...dirs].map(quote).join(" ")}`,
    undefined,
    60,
  );
  if (mkdir.exit_code !== 0) {
    throw new CodeGraphAnalyzerError(
      "upload",
      `could not create ${analyzerDir}: ${mkdir.stderr ?? ""}`,
    );
  }

  await Promise.all(
    files.map(async (file) => {
      const response = await fetch(`${PAYLOAD_BASE}/${file}`);
      if (!response.ok) {
        throw new CodeGraphAnalyzerError(
          "upload",
          `analyzer asset missing: ${file} (run "npm run build:codegraph-analyzer")`,
        );
      }
      const blob = await response.blob();
      const name = file.slice(file.lastIndexOf("/") + 1);
      // Absolute: the upload endpoint rejects relative paths outright.
      await workspace.fileUpload(blob, `${analyzerDir}/${file}`, name);
    }),
  );

  // Verify rather than assume: a partial upload would surface much later as a
  // confusing parse failure inside the analyzer.
  const check = await workspace.executeCommand(
    `test -f ${quote(`${analyzerDir}/${manifest.entry}`)} && ls ${quote(`${analyzerDir}/grammars`)} | wc -l`,
    undefined,
    60,
  );
  if (check.exit_code !== 0) {
    throw new CodeGraphAnalyzerError(
      "upload",
      "analyzer payload did not land in the workspace",
    );
  }
  const grammarCount = Number((check.stdout ?? "0").trim());
  if (grammarCount < manifest.grammars.length) {
    throw new CodeGraphAnalyzerError(
      "upload",
      `only ${grammarCount}/${manifest.grammars.length} grammars uploaded`,
    );
  }
}

/** Parses the analyzer's JSON-lines progress output off stdout. */
export function parseProgress(stdout: string): AnalyzerProgress[] {
  const events: AnalyzerProgress[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const phase = parsed.__codegraph;
      if (typeof phase !== "string") continue;
      events.push({
        phase: phase as AnalyzerPhase,
        ...(typeof parsed.fileCount === "number"
          ? { fileCount: parsed.fileCount }
          : {}),
        ...(typeof parsed.symbolCount === "number"
          ? { symbolCount: parsed.symbolCount }
          : {}),
        ...(typeof parsed.subsystemCount === "number"
          ? { subsystemCount: parsed.subsystemCount }
          : {}),
        ...(typeof parsed.reason === "string" ? { reason: parsed.reason } : {}),
      });
    } catch {
      // Not our line — the analyzer shares stdout with tree-sitter's own
      // grammar warnings, which are expected and not worth surfacing.
    }
  }
  return events;
}

export interface RunAnalysisOptions {
  snapshot: RepositorySnapshot;
  conversationUrl: string | null;
  sessionApiKey: string | null;
  workspaceId: string;
  hints: SubsystemHint[];
  onProgress?: (progress: AnalyzerProgress) => void;
  /** Analyzer wall-clock budget, in seconds. */
  timeoutSeconds?: number;
  /**
   * Real Supabase workspace/repository row ids, when resolvable. Enables the
   * Storage fast path (mirror-after-analyze, read-without-a-sandbox on
   * revisit). `null` when Supabase isn't configured or the ids couldn't be
   * resolved — analysis still works, it just always goes through the
   * sandbox, same as before this existed.
   */
  storageIds: { workspaceId: string; repositoryUuid: string } | null;
}

export interface AnalysisHandle {
  meta: CodeGraphMeta;
  root: CodeGraphLevelPayload;
  /** Fetches one drill-down level, or `null` when the node is a leaf. */
  loadLevel: (parentId: string) => Promise<CodeGraphLevelPayload | null>;
  /** Fetches the compact search index. Lazy — it is the largest artefact. */
  loadSearchIndex: () => Promise<SearchEntry[]>;
  /** Reads real source for a file node. */
  readSource: (filePath: string) => Promise<string | null>;
}

export interface SearchEntry {
  id: string;
  name: string;
  type: string;
  filePath: string;
  parentId: string;
  level: string;
}

/** Output directory for one commit — graphs never overwrite each other. */
function outputDir(localPath: string, commitSha: string): string {
  return inWorkspace(localPath, `${ANALYZER_DIR}/out/${commitSha}`);
}

async function readJson<T>(
  workspace: RemoteWorkspace,
  path: string,
): Promise<T | null> {
  try {
    return JSON.parse(await workspace.downloadAsText(path)) as T;
  } catch {
    return null;
  }
}

const ARTIFACT_BUCKET = "workspace-artifacts";

/**
 * Where a commit's graph lives in Supabase Storage, mirroring the sandbox's
 * `out/<commitSha>` layout. `workspaceId`/`repositoryId` here must be the real
 * Supabase row ids (`PersistenceIds`), not `workspaceIdForSnapshot()`'s
 * sandbox-path stand-in — the bucket's RLS checks path segment 1 against
 * `is_workspace_member`.
 */
export function codegraphStoragePrefix(
  workspaceId: string,
  repositoryId: string,
  commitSha: string,
): string {
  return `${workspaceId}/codegraph/${repositoryId}/${commitSha}`;
}

async function readJsonFromStorage<T>(path: string): Promise<T | null> {
  try {
    const url = await artifactStore.getSignedUrl(ARTIFACT_BUCKET, path);
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Best-effort mirror of a finished analysis into Storage so a later visit can
 * render the graph without a live sandbox. Never throws — a failed upload
 * just means the next `openExistingAnalysis` falls back to the sandbox (or,
 * if that's gone too, to re-analysis) instead of the Storage fast path.
 */
async function uploadArtifactsToStorage(
  workspace: RemoteWorkspace,
  dir: string,
  prefix: string,
): Promise<void> {
  try {
    const listing = await workspace.executeCommand(
      `find ${quote(dir)} -type f`,
      undefined,
      60,
    );
    if (listing.exit_code !== 0) return;
    const files = (listing.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await Promise.all(
      files.map(async (file) => {
        const relative = file.slice(dir.length + 1);
        try {
          const text = await workspace.downloadAsText(file);
          await artifactStore.put(
            ARTIFACT_BUCKET,
            `${prefix}/${relative}`,
            new Blob([text], { type: "application/json" }),
            { contentType: "application/json" },
          );
        } catch {
          // One shard failing to mirror shouldn't stop the others.
        }
      }),
    );
  } catch {
    // Storage mirroring is an optimization, not a requirement for analysis
    // to succeed.
  }
}

function mapSearchEntries(
  raw: [string, string, string, string, string, string][],
): SearchEntry[] {
  return raw.map(([id, name, type, filePath, parentId, level]) => ({
    id,
    name,
    type,
    filePath,
    parentId,
    level,
  }));
}

/**
 * Opens an already-analyzed graph for this exact commit, or `null` if none
 * exists. Lets a revisit skip re-analysis without ever falling back to a graph
 * built from a different commit.
 */
export async function openExistingAnalysis(
  options: Omit<RunAnalysisOptions, "hints" | "onProgress">,
): Promise<AnalysisHandle | null> {
  const { snapshot, storageIds } = options;

  if (storageIds) {
    const prefix = codegraphStoragePrefix(
      storageIds.workspaceId,
      storageIds.repositoryUuid,
      snapshot.commitSha,
    );
    const meta = await readJsonFromStorage<CodeGraphMeta>(
      `${prefix}/meta.json`,
    );
    const root = meta
      ? await readJsonFromStorage<CodeGraphLevelPayload>(
          `${prefix}/levels/root.json`,
        )
      : null;
    if (meta && root) {
      return makeStorageHandle(
        prefix,
        snapshot,
        options.conversationUrl,
        options.sessionApiKey,
        meta,
        root,
      );
    }
  }

  const workspace = workspaceFor(
    options.snapshot,
    options.conversationUrl,
    options.sessionApiKey,
  );
  const dir = outputDir(options.snapshot.localPath, options.snapshot.commitSha);
  const meta = await readJson<CodeGraphMeta>(workspace, `${dir}/meta.json`);
  if (!meta) return null;
  const root = await readJson<CodeGraphLevelPayload>(
    workspace,
    `${dir}/levels/root.json`,
  );
  if (!root) return null;
  return makeHandle(workspace, options.snapshot, meta, root);
}

function makeStorageHandle(
  prefix: string,
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
  meta: CodeGraphMeta,
  root: CodeGraphLevelPayload,
): AnalysisHandle {
  return {
    meta,
    root,
    loadLevel: (parentId) =>
      readJsonFromStorage<CodeGraphLevelPayload>(
        `${prefix}/levels/${shardName(parentId)}.json`,
      ),
    loadSearchIndex: async () => {
      const raw = await readJsonFromStorage<
        [string, string, string, string, string, string][]
      >(`${prefix}/search.json`);
      return raw ? mapSearchEntries(raw) : [];
    },
    readSource: async (filePath) => {
      // Raw source is never mirrored to Storage (only the derived graph is)
      // — this still needs a live sandbox, and degrades to structural facts
      // when there isn't one, same as the sandbox-backed handle below.
      try {
        const workspace = workspaceFor(
          snapshot,
          conversationUrl,
          sessionApiKey,
        );
        return await workspace.downloadAsText(
          inWorkspace(snapshot.localPath, filePath),
        );
      } catch {
        return null;
      }
    },
  };
}

function makeHandle(
  workspace: RemoteWorkspace,
  snapshot: RepositorySnapshot,
  meta: CodeGraphMeta,
  root: CodeGraphLevelPayload,
): AnalysisHandle {
  const dir = outputDir(snapshot.localPath, snapshot.commitSha);
  return {
    meta,
    root,
    loadLevel: (parentId) =>
      readJson<CodeGraphLevelPayload>(
        workspace,
        `${dir}/levels/${shardName(parentId)}.json`,
      ),
    loadSearchIndex: async () => {
      const raw = await readJson<
        [string, string, string, string, string, string][]
      >(workspace, `${dir}/search.json`);
      return raw ? mapSearchEntries(raw) : [];
    },
    readSource: async (filePath) => {
      try {
        // Node file paths are repository-relative; the download endpoint needs
        // them absolute, same as upload.
        return await workspace.downloadAsText(
          inWorkspace(snapshot.localPath, filePath),
        );
      } catch {
        // The file may have moved since analysis; the details panel degrades
        // to structural facts rather than failing the whole selection.
        return null;
      }
    },
  };
}

export async function runAnalysis(
  options: RunAnalysisOptions,
): Promise<AnalysisHandle> {
  const {
    snapshot,
    conversationUrl,
    sessionApiKey,
    workspaceId,
    hints,
    onProgress,
    timeoutSeconds = 900,
    storageIds,
  } = options;

  const workspace = workspaceFor(snapshot, conversationUrl, sessionApiKey);

  const probe = await probeSandbox(workspace);
  if (!probe.ok) {
    throw new CodeGraphAnalyzerError("preflight", probe.reason);
  }

  const manifestResponse = await fetch(`${PAYLOAD_BASE}/manifest.json`);
  if (!manifestResponse.ok) {
    throw new CodeGraphAnalyzerError(
      "preflight",
      'analyzer payload not built — run "npm run build:codegraph-analyzer"',
    );
  }
  const manifest = (await manifestResponse.json()) as AnalyzerManifest;

  await uploadPayload(workspace, snapshot.localPath, manifest);

  const analyzerDir = inWorkspace(snapshot.localPath, ANALYZER_DIR);

  // Subsystem naming input. Uploaded per run because DeepWiki's pages can be
  // regenerated independently of the graph.
  const hintsPath = `${analyzerDir}/hints.json`;
  await workspace.uploadText(JSON.stringify(hints), hintsPath, "hints.json");

  const dir = outputDir(snapshot.localPath, snapshot.commitSha);
  const command = [
    `mkdir -p ${quote(dir)} &&`,
    `node ${quote(`${analyzerDir}/${manifest.entry}`)}`,
    `--repo ${quote(snapshot.localPath)}`,
    `--out ${quote(dir)}`,
    `--commit ${quote(snapshot.commitSha)}`,
    `--workspace ${quote(workspaceId)}`,
    `--repository ${quote(snapshot.repositoryId)}`,
    `--hints ${quote(hintsPath)}`,
    `--grammars ${quote(`${analyzerDir}/grammars`)}`,
  ].join(" ");

  const result = await workspace.executeCommand(
    command,
    snapshot.localPath,
    timeoutSeconds,
  );

  parseProgress(result.stdout ?? "").forEach((event) => onProgress?.(event));

  if (result.exit_code !== 0) {
    const failure = parseProgress(result.stdout ?? "").find(
      (event) => event.phase === "failed",
    );
    throw new CodeGraphAnalyzerError(
      "analysis",
      failure?.reason ??
        (result.stderr ?? "").slice(-500) ??
        "analyzer exited non-zero",
    );
  }

  const meta = await readJson<CodeGraphMeta>(workspace, `${dir}/meta.json`);
  const root = await readJson<CodeGraphLevelPayload>(
    workspace,
    `${dir}/levels/root.json`,
  );
  if (!meta || !root) {
    throw new CodeGraphAnalyzerError(
      "analysis",
      "analyzer finished but produced no readable graph",
    );
  }

  if (storageIds) {
    await uploadArtifactsToStorage(
      workspace,
      dir,
      codegraphStoragePrefix(
        storageIds.workspaceId,
        storageIds.repositoryUuid,
        snapshot.commitSha,
      ),
    );
  }

  return makeHandle(workspace, snapshot, meta, root);
}
