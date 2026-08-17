import type { VideoManifest, VideoScene } from "@/lib/types";

/**
 * Intentionally returns an empty string.
 *
 * This used to fabricate fake `export const Component = () => {...}` style code as a
 * fallback when a file could not be resolved. That fabricated code is exactly the
 * "random gibberish on screen" we are eliminating — it has nothing to do with the
 * real repository. We now never show invented code: callers should fall back to the
 * real file content or to an honest empty state.
 *
 * Kept exported (returning "") so existing call sites continue to compile.
 */
export function generatePlaceholderCode(_scene: VideoScene): string {
  return "";
}

export function enrichManifestWithCode(
  manifest: VideoManifest,
  fileContents: Record<string, string>
): VideoManifest {
  const repoFiles = Object.keys(fileContents);
  const resolvedRepoFiles = repoFiles.length > 0 ? repoFiles : manifest.repo_files || [];
  const normalizePath = (value: string) => value.replace(/^\.\/+/, "").replace(/^\/+/, "");
  const normalizedContents = new Map<string, string>(
    Object.entries(fileContents).map(([path, contents]) => [normalizePath(path), contents])
  );

  const lookupCode = (filePath?: string): string | undefined => {
    if (!filePath) return undefined;
    if (fileContents[filePath]) return fileContents[filePath];
    const normalizedPath = normalizePath(filePath);
    if (normalizedContents.has(normalizedPath)) return normalizedContents.get(normalizedPath);
    const suffixMatch = Object.keys(fileContents).find((path) =>
      normalizePath(path).endsWith(`/${normalizedPath}`)
    );
    if (suffixMatch) return fileContents[suffixMatch];
    const base = normalizedPath.split("/").pop() || "";
    if (base) {
      const basenameMatches = Object.keys(fileContents).filter(
        (path) => normalizePath(path).split("/").pop() === base
      );
      if (basenameMatches.length === 1) return fileContents[basenameMatches[0]];
    }
    const containsMatches = Object.keys(fileContents).filter((path) => {
      const np = normalizePath(path);
      return np.includes(normalizedPath) || normalizedPath.includes(np);
    });
    if (containsMatches.length === 1) return fileContents[containsMatches[0]];
    return undefined;
  };

  return {
    ...manifest,
    repo_files: resolvedRepoFiles,
    scenes: manifest.scenes.map((scene) => {
      const actualCode = lookupCode(scene.file_path);
      const trimmedActual = actualCode?.trim();
      const trimmedExisting = scene.code?.trim();

      // Prefer the real file content; keep any real code the generator already
      // attached. NEVER fabricate placeholder code — fake snippets are exactly the
      // "gibberish on screen" we are eliminating. If nothing real exists, leave the
      // code empty and let the renderer show an honest "file not available" note.
      const code = trimmedActual
        ? actualCode
        : trimmedExisting
          ? scene.code
          : "";

      return {
        ...scene,
        code,
      };
    }),
  };
}
