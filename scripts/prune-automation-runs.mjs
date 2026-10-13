#!/usr/bin/env node
/**
 * Prune old automation-run workspaces.
 *
 * Every automation run gets its own folder under
 * `<AUTOMATION_WORKSPACE_BASE>/automation-runs/<run-id>/` (a full repo copy,
 * often with node_modules). Nothing upstream ever deletes them, so they grow
 * without bound — tens of GB in a few weeks. Launchers call this at startup.
 *
 * Dependency-free (node: builtins only) so the Docker image can run it as a
 * CLI next to runtime-services-info.mjs:
 *
 *   node prune-automation-runs.mjs <automation-runs-dir>
 *
 * Retention comes from AUTOMATION_RUN_RETENTION_DAYS (default 3; 0 disables).
 * Folders touched in the last 24 h are always kept so an in-flight run is
 * never removed. Never throws: pruning must not block startup.
 */
import { lstatSync, readdirSync, rmSync, statfsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

export const DEFAULT_RETENTION_DAYS = 3;
export const RETENTION_ENV_VAR = "AUTOMATION_RUN_RETENTION_DAYS";
export const AUTOMATION_RUNS_SUBDIR = "automation-runs";
export const LOW_DISK_THRESHOLD_BYTES = 5 * 1024 ** 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_AGE_MS = DAY_MS;

export function resolveRetentionDays(env = process.env) {
  const raw = env[RETENTION_ENV_VAR];
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;
  const days = Number(raw);
  return Number.isFinite(days) && days >= 0 ? days : DEFAULT_RETENTION_DAYS;
}

function dirSizeBytes(path) {
  let total = 0;
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        try {
          total += lstatSync(full).size;
        } catch {
          // vanished mid-walk; ignore
        }
      }
    }
  }
  return total;
}

/**
 * Delete direct-child run folders of `dir` older than `retentionDays`.
 * @returns {{ removed: number, freedBytes: number, errors: string[] }}
 */
export function pruneAutomationRuns({
  dir,
  retentionDays = DEFAULT_RETENTION_DAYS,
  now = Date.now(),
}) {
  const result = { removed: 0, freedBytes: 0, errors: [] };
  if (!(retentionDays > 0)) return result;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  const cutoffMs = Math.max(retentionDays * DAY_MS, MIN_AGE_MS);
  for (const entry of entries) {
    // Only real directories: never follow symlinks out of the runs folder.
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    try {
      const stat = lstatSync(full);
      if (now - stat.mtimeMs < cutoffMs) continue;
      const size = dirSizeBytes(full);
      rmSync(full, { recursive: true, force: true });
      result.removed += 1;
      result.freedBytes += size;
    } catch (error) {
      result.errors.push(
        `${full}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}

/** Free bytes on the volume holding `path`, or null when unknown. */
export function freeDiskBytes(path) {
  try {
    const { bavail, bsize } = statfsSync(path);
    return Number(bavail) * Number(bsize);
  } catch {
    return null;
  }
}

export function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: prune-automation-runs.mjs <automation-runs-dir>");
    process.exit(0);
  }
  const { removed, freedBytes, errors } = pruneAutomationRuns({
    dir,
    retentionDays: resolveRetentionDays(),
  });
  if (removed > 0) {
    console.log(
      `pruned ${removed} old automation runs (${formatBytes(freedBytes)})`,
    );
  }
  for (const error of errors) console.error(`prune failed: ${error}`);
}
