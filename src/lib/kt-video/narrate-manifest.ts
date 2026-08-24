import DeepWikiService from "#/api/deepwiki-service/deepwiki-service.api";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import type { KtManifest, KtScene } from "./build-manifest";

const FPS = 30;
const WORDS_PER_SECOND = 2.3;
const MIN_SCENE_SECONDS = 6;
const MAX_CODE_EXCERPT_LINES = 40;

interface NarratableScene {
  id: number;
  type: string;
  title: string;
  file_path: string | null;
  focus_symbols: string[];
  code_excerpt: string;
}

function excerptFor(scene: KtScene): string {
  if (!scene.code) return "";
  const lines = scene.code.split("\n");
  const [start, end] = scene.highlight_lines;
  const from = Math.max(0, start - 1);
  const to = Math.min(lines.length, Math.max(from + 1, end));
  const slice = lines.slice(from, to);
  return slice.length > MAX_CODE_EXCERPT_LINES
    ? slice.slice(0, MAX_CODE_EXCERPT_LINES).join("\n")
    : slice.join("\n");
}

function buildPrompt(scenes: NarratableScene[]): string {
  const scenesBlock = scenes
    .map(
      (s) =>
        `Scene ${s.id} (${s.type}) — ${s.title}${s.file_path ? ` [${s.file_path}]` : ""}${
          s.focus_symbols.length
            ? ` — key symbols: ${s.focus_symbols.join(", ")}`
            : ""
        }${s.code_excerpt ? `\n\`\`\`\n${s.code_excerpt}\n\`\`\`` : ""}`,
    )
    .join("\n\n");

  return `You are narrating a code-walkthrough video, like a senior engineer giving a live tutorial to a new teammate. Below are the video's scenes in order, each with the real file/symbol/code it shows — this is the ONLY material you may reference. Do not mention any file, function, or fact not shown below.

For EACH scene, write 1-3 sentences of natural, spoken-style narration explaining what's on screen and why it matters — specific and concrete, never generic filler like "this is an important file". Keep the tone like a tutorial, not documentation prose.

${scenesBlock}

Respond with ONLY a JSON array, one entry per scene, in this exact shape (no other text, no markdown fence):
[{"id": 0, "narration": "..."}, {"id": 1, "narration": "..."}]`;
}

function retimeManifest(manifest: KtManifest): KtManifest {
  let cursor = 0;
  for (const scene of manifest.scenes) {
    scene.startFrame = cursor;
    cursor += scene.durationInFrames;
    scene.endFrame = cursor;
  }
  return { ...manifest, totalFrames: Math.max(1, cursor) };
}

/**
 * Best-effort tutorial-narration pass over an already-built, fully
 * deterministic manifest. Rewrites only `narration_text`/`sentences[].
 * sentence` prose — every scene's `source_refs`/`file_path`/`highlight_lines`
 * (the actual grounding) come from the deterministic builder and are never
 * touched here, so a bad or hallucinated response can change what's SAID,
 * never what's CITED. Falls back to the manifest's existing template
 * narration per-scene on any parse failure, missing entry, or network error
 * — never blocks or fails video generation.
 */
export async function narrateManifest(
  manifest: KtManifest,
  snapshot: RepositorySnapshot,
): Promise<KtManifest> {
  if (manifest.scenes.length === 0) return manifest;

  const narratable: NarratableScene[] = manifest.scenes.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    file_path: s.file_path,
    focus_symbols: s.focus_symbols,
    code_excerpt: excerptFor(s),
  }));

  let response: string;
  try {
    response = await DeepWikiService.chatCompletion({
      repo_url: snapshot.localPath,
      type: "local",
      provider: "google",
      messages: [{ role: "user", content: buildPrompt(narratable) }],
    });
  } catch {
    return manifest;
  }

  let parsed: { id: number; narration: string }[];
  try {
    const jsonMatch = /\[[\s\S]*\]/.exec(response);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);
    if (!Array.isArray(parsed)) throw new Error("not an array");
  } catch {
    return manifest;
  }

  const byId = new Map(
    parsed
      .filter(
        (entry) =>
          typeof entry?.id === "number" &&
          typeof entry?.narration === "string" &&
          entry.narration.trim().length > 0,
      )
      .map((entry) => [entry.id, entry.narration.trim()]),
  );

  const scenes = manifest.scenes.map((scene) => {
    const narration = byId.get(scene.id);
    if (!narration) return scene;

    const words = narration.split(/\s+/).filter(Boolean).length;
    const duration_seconds = Math.max(
      MIN_SCENE_SECONDS,
      Math.ceil(words / WORDS_PER_SECOND) + 2,
    );

    return {
      ...scene,
      narration_text: narration,
      // Grounding (source_refs/on_screen_focus) stays exactly what the
      // deterministic builder computed — only the spoken text changes.
      sentences: scene.sentences.length
        ? [{ ...scene.sentences[0], sentence: narration }]
        : [{ sentence: narration, source_refs: [], on_screen_focus: [] }],
      durationInFrames: Math.round(duration_seconds * FPS),
    };
  });

  return retimeManifest({ ...manifest, scenes });
}
