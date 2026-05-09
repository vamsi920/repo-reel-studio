import type { GitNexusGraphData, VideoManifest } from "@/lib/types";
import { INCREMENTAL_SCENE_REGEN_ENABLED } from "@/env";

function normPath(p: string) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/u, "")
    .trim();
}

export function pathsFromCompareFiles(
  files: Array<{ filename?: string; previous_filename?: string | null; status?: string }>
): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const fn = normPath(f.filename || "");
    const prev = normPath(f.previous_filename || "");
    if (fn) out.add(fn);
    if (prev) out.add(prev);
  }
  return [...out];
}

/** Anchors README.* and root manifests when those paths changed (conservative recap). */
export function anchorPathsFromChangedList(paths: string[]): string[] {
  const anchors = new Set<string>();
  for (const p of paths) {
    const n = normPath(p);
    if (!n) continue;
    const leaf = n.split("/").pop() || "";
    if (/^readme/i.test(leaf)) anchors.add(n);
    if (leaf === "package.json" || leaf === "pyproject.toml") anchors.add(n);
  }
  return [...anchors];
}

/**
 * Phase B (incremental LLM/TTS): expand seed paths via graph topology.
 * Currently returns normalized seeds unchanged — wire importer neighbors here when VITE_INCREMENTAL_SCENE_REGEN is enabled.
 */
export function expandPathsWithImportNeighbors(
  graphData: GitNexusGraphData | null | undefined,
  seeds: string[]
): string[] {
  if (INCREMENTAL_SCENE_REGEN_ENABLED && graphData) {
    /** Phase B placeholder: walk import edges from seeds; today we only normalize. */
  }

  const out = new Set(
    seeds
      .map((s) => s.replace(/\\/g, "/").replace(/^\/+/u, "").trim())
      .filter(Boolean)
  );
  return [...out];
}

/** Scene ids whose primary or repo-map paths intersect the touched path set (Phase B incremental regen hook). */
export function pickSceneIdsAffectedByChanges(
  manifest: VideoManifest | null | undefined,
  changedPaths: Iterable<string>
): number[] {
  if (!manifest?.scenes?.length) return [];

  const norm = (p: string) =>
    String(p || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/u, "");
  const touches = new Set(
    [...changedPaths].map((p) => norm(p)).filter(Boolean)
  );
  const ids: number[] = [];

  for (const scene of manifest.scenes) {
    const fp = norm(scene.file_path || "");
    if (fp && touches.has(fp)) {
      ids.push(scene.id);
      continue;
    }
    const rmp = scene.repo_map_paths || [];
    if (rmp.some((rp) => touches.has(norm(rp)))) ids.push(scene.id);
  }

  return [...new Set(ids)];
}

export function collectSceneFilePaths(manifest: VideoManifest | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!manifest?.scenes?.length) return set;
  const norm = (p: string) =>
    String(p || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/u, "");
  for (const scene of manifest.scenes) {
    if (scene.file_path) set.add(norm(scene.file_path));
    for (const p of scene.repo_map_paths || []) set.add(norm(p));
  }
  return set;
}

/**
 * Seeds for partial ingest: compare paths intersected lightly with scenes + Phase B neighbors.
 */
export function expandRefreshPathSeeds(
  comparePaths: string[],
  manifest: VideoManifest | null | undefined,
  graphData: GitNexusGraphData | null | undefined
): string[] {
  void manifest;
  const seeds = new Set(
    comparePaths
      .map((p) => normPath(p))
      .filter(Boolean)
  );
  return expandPathsWithImportNeighbors(graphData, [...seeds]);
}
