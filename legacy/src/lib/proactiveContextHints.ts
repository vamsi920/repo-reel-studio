import type { AgentRunContextHints } from "@/lib/agentRuns";

const REPO_ROOT_MARKERS = ["/src/", "/server/", "/lib/", "/app/", "/components/", "/pages/", "/routes/"];

const MAX_FOCUS = 10;
const MAX_HUB = 8;
const MAX_ENTRY = 6;
const MAX_TECH = 8;

export type ProactiveManifestLike = {
  scenes?: Array<{ file_path?: string | null }>;
  evidence_bundle?: {
    important_files?: string[];
    hub_files?: string[];
    entry_candidates?: string[];
    snippet_catalog?: unknown[];
    repo_stats?: { key_technologies?: string[] };
  } | null;
  knowledge_graph?: { summary?: { architecture?: string | null } } | null;
};

export type ProactiveGraphLike = {
  summary?: {
    hubFiles?: string[];
    entryPoints?: string[];
    keyTechnologies?: string[];
    architecturePattern?: string | null;
  } | null;
} | null;

export function normalizeContextPath(path: string): string | null {
  let cleaned = path.trim().replace(/\\/g, "/");
  if (!cleaned || cleaned.split("/").some((segment) => segment === "..")) return null;
  if (cleaned.startsWith("local://")) cleaned = cleaned.slice("local://".length).replace(/^\/+/, "");
  const lowered = cleaned.toLowerCase();
  if (lowered.startsWith("http://") || lowered.startsWith("https://")) return null;

  if (!cleaned.startsWith("/")) return cleaned.replace(/^\/+/, "");

  let best: string | null = null;
  for (const marker of REPO_ROOT_MARKERS) {
    const idx = lowered.lastIndexOf(marker);
    if (idx < 0) continue;
    const candidate = cleaned.slice(idx + 1);
    if (!best || candidate.length > best.length) best = candidate;
  }
  if (best) return best;
  return cleaned.replace(/^\/+/, "");
}

function normalizePathList(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of values) {
    const rel = normalizeContextPath(String(raw ?? ""));
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    ordered.push(rel);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

function normalizeStringList(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of values) {
    const text = String(raw ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    ordered.push(text.slice(0, 120));
    if (ordered.length >= limit) break;
  }
  return ordered;
}

function normalizeCount(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 10_000);
}

export function buildProactiveContextHints(
  manifest: ProactiveManifestLike | null,
  graphData: ProactiveGraphLike,
): AgentRunContextHints {
  const focusFiles = normalizePathList(
    [
      ...(manifest?.scenes?.map((scene) => scene.file_path) ?? []),
      ...(manifest?.evidence_bundle?.important_files ?? []),
    ],
    MAX_FOCUS,
  );

  const hubFiles = normalizePathList(
    [...(manifest?.evidence_bundle?.hub_files ?? []), ...(graphData?.summary?.hubFiles ?? [])],
    MAX_HUB,
  );

  const entryFiles = normalizePathList(
    [...(manifest?.evidence_bundle?.entry_candidates ?? []), ...(graphData?.summary?.entryPoints ?? [])],
    MAX_ENTRY,
  );

  const technologies = normalizeStringList(
    [
      ...(manifest?.evidence_bundle?.repo_stats?.key_technologies ?? []),
      ...(graphData?.summary?.keyTechnologies ?? []),
    ],
    MAX_TECH,
  );

  const snippetCount = manifest?.evidence_bundle?.snippet_catalog?.length ?? 0;

  return {
    focusFiles,
    hubFiles,
    entryFiles,
    technologies,
    architecture:
      manifest?.knowledge_graph?.summary?.architecture ??
      graphData?.summary?.architecturePattern ??
      null,
    evidenceCount: snippetCount,
    snippetCount,
  };
}

export function serializeProactiveContextHints(
  hints: AgentRunContextHints | Record<string, unknown> | null | undefined,
): AgentRunContextHints {
  const raw = hints ?? {};
  const evidenceCount = normalizeCount(
    "evidenceCount" in raw ? raw.evidenceCount : "snippetCount" in raw ? raw.snippetCount : 0,
  );
  const snippetCount = normalizeCount(
    "snippetCount" in raw ? raw.snippetCount : "evidenceCount" in raw ? raw.evidenceCount : evidenceCount,
  );
  const architecture =
    typeof raw.architecture === "string" && raw.architecture.trim() ? raw.architecture.trim().slice(0, 240) : null;

  return {
    focusFiles: normalizePathList("focusFiles" in raw ? raw.focusFiles : [], MAX_FOCUS),
    hubFiles: normalizePathList("hubFiles" in raw ? raw.hubFiles : [], MAX_HUB),
    entryFiles: normalizePathList("entryFiles" in raw ? raw.entryFiles : [], MAX_ENTRY),
    technologies: normalizeStringList("technologies" in raw ? raw.technologies : [], MAX_TECH),
    architecture,
    evidenceCount,
    snippetCount,
  };
}
