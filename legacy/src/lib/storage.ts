// Local storage implementation — no Firebase Storage.
// Audio blobs are kept in an in-memory map as object URLs (session-scoped).
// Graph artifacts are stored in localStorage as text.

const AUDIO_CACHE = new Map<string, string>(); // path → object URL
const LS_GRAPH_PREFIX = "reel_studio_graph:";

export const AUDIO_PREFIX = "project-audio" as const;
export const GRAPH_PREFIX = "project-graphs" as const;

export function scopedAudioPath(userId: string, projectId: string, sceneId: string | number): string {
  return `${AUDIO_PREFIX}/${userId}/${projectId}/${sceneId}.mp3`;
}

export function graphArtifactPrefix(userId: string, projectId: string): string {
  return `${GRAPH_PREFIX}/${userId}/${projectId}/codegraph`;
}

export function graphJsonObjectKey(userId: string, projectId: string): string {
  return `${graphArtifactPrefix(userId, projectId)}/graph.json`;
}

export function graphCsvObjectKey(userId: string, projectId: string): string {
  return `${graphArtifactPrefix(userId, projectId)}/graph.csv`;
}

/** @deprecated use scopedAudioPath */
export function audioObjectKey(projectId: string, sceneId: string | number): string {
  return `${projectId}/${sceneId}.mp3`;
}

export async function uploadSceneAudio(
  userId: string,
  projectId: string,
  sceneId: string | number,
  blob: Blob,
): Promise<string> {
  const path = scopedAudioPath(userId, projectId, sceneId);
  // Revoke previous object URL to avoid leaks
  const prev = AUDIO_CACHE.get(path);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  AUDIO_CACHE.set(path, url);
  return url;
}

export async function uploadGraphJson(userId: string, projectId: string, blob: Blob): Promise<string> {
  const path = graphJsonObjectKey(userId, projectId);
  try {
    const text = await blob.text();
    localStorage.setItem(LS_GRAPH_PREFIX + path, text);
  } catch (e) {
    console.warn("[storage] graph JSON too large for localStorage, skipping:", e);
  }
  return path;
}

export async function uploadGraphCsv(userId: string, projectId: string, blob: Blob): Promise<string> {
  const path = graphCsvObjectKey(userId, projectId);
  try {
    const text = await blob.text();
    localStorage.setItem(LS_GRAPH_PREFIX + path, text);
  } catch (e) {
    console.warn("[storage] graph CSV too large for localStorage, skipping:", e);
  }
  return path;
}

export const audioStorage = {
  async publicUrl(userId: string, projectId: string, sceneId: string | number): Promise<string> {
    const path = scopedAudioPath(userId, projectId, sceneId);
    const url = AUDIO_CACHE.get(path);
    if (!url) throw new Error(`Audio not found in local cache: ${path}`);
    return url;
  },
};

export const graphStorage = {
  async publicUrlForKey(storagePath: string): Promise<string> {
    const text = localStorage.getItem(LS_GRAPH_PREFIX + storagePath);
    if (!text) throw new Error(`Graph artifact not found locally: ${storagePath}`);
    const blob = new Blob([text], { type: storagePath.endsWith(".csv") ? "text/csv" : "application/json" });
    return URL.createObjectURL(blob);
  },
};
