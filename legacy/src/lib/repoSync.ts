/**
 * Orchestration for Studio “sync from GitHub” — resolves HEAD, compares to pinned snapshot,
 * partial blob ingest, merges into baseline file map, emits gitingest-shaped content string.
 */

import type { GitNexusGraphData, VideoManifest } from "@/lib/types";
import { API_URL } from "@/env";
import { parseRepoContent } from "@/lib/parseRepoContent";
import {
  anchorPathsFromChangedList,
  expandRefreshPathSeeds,
  pathsFromCompareFiles,
} from "@/lib/repoSyncScopes";

function apiSuffix(pathQuery: string) {
  return API_URL === "/api" ? `/api${pathQuery}` : `${API_URL}/api${pathQuery}`;
}

export interface GithubResolveRefResult {
  owner: string;
  repo: string;
  branch: string | null;
  sha: string;
  committed_at: string | null;
}

export async function githubResolveRef(
  repoUrl: string,
  branch?: string | null
): Promise<GithubResolveRefResult> {
  const q = new URLSearchParams();
  q.set("repoUrl", repoUrl.trim());
  if (branch?.trim()) q.set("branch", branch.trim());

  const res = await fetch(apiSuffix(`/github/resolve-ref?${q}`), {
    credentials: "include",
  });

  const text = await res.text();
  let payload: GithubResolveRefResult & { error?: string; detail?: string } = {};
  try {
    payload = text ? (JSON.parse(text) as GithubResolveRefResult & { error?: string }) : {};
  } catch {
    payload = { error: text || `HTTP ${res.status}` };
  }

  if (!res.ok || !payload.sha) {
    const msg =
      (payload as { detail?: string }).detail ||
      payload.error ||
      `resolve-ref failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return {
    owner: payload.owner,
    repo: payload.repo,
    branch: payload.branch ?? null,
    sha: payload.sha,
    committed_at: payload.committed_at ?? null,
  };
}

export interface GithubCompareResult {
  status: string | null;
  ahead_by: number | null;
  behind_by: number | null;
  total_commits: number | null;
  files: Array<{
    filename?: string;
    status?: string;
    previous_filename?: string | null;
    patch?: string;
  }>;
}

export async function githubCompareApi(
  repoUrl: string,
  baseSha: string,
  headSha: string,
  includePatch = false
): Promise<GithubCompareResult> {
  const q = new URLSearchParams({
    repoUrl: repoUrl.trim(),
    base: baseSha.trim(),
    head: headSha.trim(),
  });
  if (includePatch) q.set("includePatch", "1");

  const res = await fetch(apiSuffix(`/github/compare?${q}`), { credentials: "include" });

  const text = await res.text();
  let payload = {} as GithubCompareResult & { error?: string; detail?: string };
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `compare HTTP ${res.status}`);
  }

  if (!res.ok) {
    const msg = payload.detail || payload.error || `compare failed (${res.status})`;
    throw new Error(msg);
  }

  return payload;
}

export interface IngestPathsResult {
  repoUrl: string;
  branch: string | null;
  resolvedCommitSha: string | null;
  committedAt: string | null;
  files: Record<string, string>;
  removed: string[];
  unsupported: string[];
  requested_count: number;
}

export async function ingestSelectedGithubPaths(opts: {
  repoUrl: string;
  paths: string[];
  branch?: string | null;
}): Promise<IngestPathsResult> {
  const res = await fetch(apiSuffix(`/ingest-paths`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repoUrl: opts.repoUrl.trim(),
      paths: [...new Set(opts.paths)].slice(0, 500),
      branch: opts.branch?.trim() || undefined,
      maxPaths: 200,
    }),
  });

  const text = await res.text();
  let payload = {} as IngestPathsResult & { error?: string; detail?: string };
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `ingest-paths HTTP ${res.status}`);
  }

  if (!res.ok) {
    const msg =
      typeof payload.detail === "string"
        ? payload.detail
        : typeof payload.error === "string"
          ? payload.error
          : `ingest-paths (${res.status})`;
    throw new Error(msg);
  }

  return {
    repoUrl: payload.repoUrl,
    branch: payload.branch ?? null,
    resolvedCommitSha: payload.resolvedCommitSha ?? null,
    committedAt: payload.committedAt ?? null,
    files: payload.files && typeof payload.files === "object" ? payload.files : {},
    removed: Array.isArray(payload.removed) ? payload.removed : [],
    unsupported: Array.isArray(payload.unsupported) ? payload.unsupported : [],
    requested_count: payload.requested_count ?? opts.paths.length,
  };
}

export function mergePartialFileContents(
  baseline: Record<string, string>,
  updates: Record<string, string>,
  removed: string[]
): Record<string, string> {
  const out = { ...baseline };
  for (const path of removed) {
    const n = normalizeRelPath(path);
    if (!n) continue;
    delete out[n];
  }
  for (const [rel, content] of Object.entries(updates)) {
    const n = normalizeRelPath(rel);
    if (!n) continue;
    out[n] = content;
  }
  return out;
}

export function normalizeRelPath(p: string): string {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/u, "")
    .trim();
}

export function fileContentsToGitingestString(files: Record<string, string>): string {
  const keys = Object.keys(files).sort((a, b) => a.localeCompare(b));
  return keys.map((k) => `\n\n----- FILE: ${k} -----\n${files[k]}`).join("");
}

export function normalizeRepoUrl(repoUrl: string): string {
  return String(repoUrl || "").trim().replace(/\/+$/u, "");
}

export function isGithubRepoUrl(repoUrl: string): boolean {
  return /^https?:\/\/github\.com\/[^/]+\/[^/]+/iu.test(normalizeRepoUrl(repoUrl));
}

export function loadBaselineFileContentsFromRepoContent(
  repoContent: string | null | undefined
): Record<string, string> {
  return parseRepoContent(String(repoContent || ""));
}

export const SYNC_MAX_PARTIAL_PATHS = 200;

/** Build bounded path list from compare payload + manifests + anchors. */
export function buildSyncPathSelection(
  compare: GithubCompareResult,
  manifest: VideoManifest | null | undefined,
  graphData: GitNexusGraphData | null | undefined
): string[] {
  const raw = pathsFromCompareFiles(compare.files || []);

  /** Always include anchors when repo metadata files move. */
  const extraAnchors = anchorPathsFromChangedList(raw);

  let combined = [...new Set([...raw, ...extraAnchors])];

  combined = expandRefreshPathSeeds(combined, manifest, graphData);

  combined = [...new Set(combined.map(normalizeRelPath).filter(Boolean))];

  if (combined.length > SYNC_MAX_PARTIAL_PATHS) {
    const scenePrefs = [...collectSceneIntersection(combined, manifest)];
    combined = [...new Set([...scenePrefs, ...combined])];
    combined = combined.slice(0, SYNC_MAX_PARTIAL_PATHS);
  }

  return combined;
}

function collectSceneIntersection(paths: string[], manifest: VideoManifest | null | undefined): string[] {
  if (!manifest?.scenes) return [];

  const set = new Set(paths.map(normalizeRelPath));
  const out: string[] = [];
  for (const scene of manifest.scenes) {
    const fp = normalizeRelPath(scene.file_path || "");
    if (fp && set.has(fp)) out.push(fp);
    for (const rp of scene.repo_map_paths || []) {
      const n = normalizeRelPath(rp);
      if (set.has(n)) out.push(n);
    }
  }
  return [...new Set(out)];
}
