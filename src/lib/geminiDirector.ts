import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_API_BASE, USE_MOCK_MANIFEST } from "@/env";
import { parseRepoContent } from "@/lib/parseRepoContent";
import { getGraphHintsForGemini, getImportantFiles } from "@/lib/codeGraph";
import {
  buildGraphTutorialBlueprint,
  buildManifestFromBlueprint,
  buildTutorialContextDigest,
  mergeManifestWithBlueprint,
} from "@/lib/tutorialBlueprint";
import type { VideoManifest, VideoScene, GitNexusGraphData } from "@/lib/types";

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

const MAX_DIGEST_CHARS = 40_000;
const LINES_PER_EXCERPT = 180;

function buildStructuredDigest(
  fileContents: Record<string, string>,
  maxChars: number,
  importantFiles: string[] = []
): string {
  const paths = Object.keys(fileContents).sort();
  const fileList = paths.join("\n");

  const readme = paths.find((path) => /readme/i.test(path));
  const entry = paths.find(
    (path) =>
      /(^|\/)(index|main|app)\.(t|j)sx?$/i.test(path) ||
      /src\/(App|main)\.[tj]sx?$/i.test(path) ||
      /(^|\/)app\.(t|j)sx?$/i.test(path)
  );

  const graphImportant = importantFiles.filter(
    (path) => paths.includes(path) && path !== readme && path !== entry
  );
  const others = paths.filter(
    (path) => !graphImportant.includes(path) && path !== readme && path !== entry
  );
  const keyPaths = Array.from(
    new Set([readme, entry, ...graphImportant, ...others].filter(Boolean) as string[])
  ).slice(0, 10);

  const excerpts = keyPaths.map((path) => {
    const raw = fileContents[path] || "";
    const lines = raw.split(/\r?\n/).slice(0, LINES_PER_EXCERPT).join("\n");
    return `--- ${path} ---\n${lines}`;
  });

  const structSummary = importantFiles.length > 0
    ? `GRAPH STRUCTURE SUMMARY:\n${importantFiles.slice(0, 7).map((file) => `- ${file}`).join("\n")}\n\n`
    : "";

  const digest = `FILES:\n${fileList}\n\n${structSummary}EXCERPTS:\n${excerpts.join("\n\n")}`;
  return digest.length > maxChars
    ? `${digest.slice(0, maxChars)}\n... (truncated)`
    : digest;
}

function stripMarkdownFence(value: string) {
  if (!value.startsWith("```")) return value;
  return value.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
}

function parseGeminiJson<T>(raw: string): T {
  const text = stripMarkdownFence(raw.trim());

  try {
    return JSON.parse(text) as T;
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as T;
      } catch {
        // continue
      }
    }

    const scenesStart = text.indexOf('"scenes"');
    if (scenesStart !== -1) {
      const arrayStart = text.indexOf("[", scenesStart);
      const lastCompleteScene = text.lastIndexOf("},");
      const lastBrace = text.lastIndexOf("}");
      const cutAt = lastCompleteScene !== -1 ? lastCompleteScene + 1 : lastBrace;
      if (arrayStart !== -1 && cutAt !== -1 && cutAt > arrayStart) {
        const candidate = `${text.slice(0, cutAt)}]}`;
        return JSON.parse(candidate) as T;
      }
    }

    throw new Error("Could not parse JSON from Gemini response");
  }
}

function buildGraphPrompt(
  repoUrl: string,
  repoName: string,
  digest: string,
  graphHints: string,
  blueprint: ReturnType<typeof buildGraphTutorialBlueprint>
) {
  const sceneSkeleton = blueprint?.scenePlan.map((scene, index) => ({
    id: index + 1,
    title: scene.title,
    phase: scene.phase,
    type: scene.type,
    visual_type: scene.visualType,
    file_path: scene.filePath,
    highlight_lines: scene.highlightLines,
    bullet_points: scene.bulletPoints,
    focus_symbols: scene.focusSymbols,
    duration_seconds: scene.durationSeconds,
    diagram: scene.diagram,
    narration_brief: scene.narrationBrief,
  }));

  return `You are a principal engineer creating an enterprise-grade repo walkthrough video.
Your audience includes developers and non-technical viewers, so every scene must start with plain-English meaning before zooming into technical detail.

Repository: ${repoName}
URL: ${repoUrl}

MANDATE:
- Treat the code-graph tutorial blueprint as ground truth for ordering, file selection, and visuals.
- Preserve every scene in the blueprint and keep the same scene count. DO NOT skip or truncate any scenes.
- Keep file_path, phase, visual_type, highlight_lines, bullet_points, focus_symbols, and diagram.mermaid aligned with the blueprint unless you are tightening wording.
- Narration must match what is on screen. If visual_type is "diagram", describe the architecture or flow shown by the diagram. If visual_type is "code", explain why this file matters and what the highlighted region proves.
- Explain the repo like a senior engineer onboarding a new teammate: problem first, architecture second, runtime flow third, details last.
- Avoid hype, filler, and generic phrases like "this file handles logic". Be specific.
- Keep the language understandable to a layman without dumbing down the real architecture.
- This video MUST contain the COMPLETE walkthrough. Do NOT truncate or cut short.
- Allow the total duration to be as long as needed (3-7+ minutes is perfectly fine).
- CRITICAL SCENE ORDER: Scene 1 MUST be the hook/intro. Conclusion MUST be the LAST scene. Follow blueprint order exactly — hook first, then architecture, flow, deep dives, details, conclusion last.

NARRATION STYLE — CRITICAL:
- Write narration as SPOKEN WORDS that will be read aloud by a text-to-speech voice.
- NEVER include file paths, directory paths, or slashes in narration text. Instead of "src/utils/helper.ts", say "the helper utility module". Instead of "src/components/Button.tsx", say "the Button component".
- NEVER use backslashes, forward slashes, dots-as-path-separators, or technical path notation in narration.
- Refer to files by their PURPOSE or HUMAN-READABLE NAME: "the main entry point", "the authentication service", "the database configuration", "the routing module".
- Write like you are speaking to a friend explaining the project over coffee. Use natural, conversational language.
- Avoid robotic phrasing. Instead of "This file exports a function that...", say "Here we define how the app...".
- Do NOT start sentences with "This file" or "This module" repeatedly. Vary your sentence structure.
- Use simple everyday words. Say "stores data" not "persists entities". Say "connects to" not "interfaces with".
- The narration will be read by TTS — write it to SOUND GOOD when spoken aloud.

NARRATION LENGTH:
- For code/diagram scenes: write 60-120 words of narration. Be thorough.
- For overview scenes: write 50-90 words of narration.
- Every scene narration MUST be a complete thought — never end mid-sentence.
- duration_seconds = ceil(word_count / 2.3) + 3 (buffer for pauses and transitions).
- CRITICAL: Do NOT shorten narration to save space. Write the FULL explanation for each scene.

OUTPUT RULES:
- Return ONLY valid JSON.
- Keep scene order IDENTICAL to the blueprint. Hook/intro is scene 1. Conclusion is the last scene.
- ALL scenes must be present in the output — do NOT drop any scenes.
- code must be an empty string.

SCHEMA:
{
  "title": "string",
  "repo_files": ["string"],
  "scenes": [
    {
      "id": 1,
      "type": "intro|overview|entry|feature|core|code|support|summary|wrap_up|outro",
      "phase": "hook|architecture|flow|deep_dive|details|conclusion",
      "visual_type": "code|overview|diagram",
      "file_path": "string",
      "highlight_lines": [1, 10],
      "title": "string",
      "narration_text": "string",
      "duration_seconds": 16,
      "code": "",
      "bullet_points": ["string"],
      "focus_symbols": ["string"],
      "diagram": { "mermaid": "flowchart LR ...", "caption": "string" }
    }
  ]
}

CODE GRAPH BLUEPRINT:
${JSON.stringify(sceneSkeleton, null, 2)}

CODE GRAPH INSIGHTS:
${graphHints || "No extra graph notes."}

CURATED REPOSITORY CONTEXT:
${digest}`;
}

function buildDigestPrompt(
  repoUrl: string,
  repoName: string,
  digest: string,
  graphHints: string
) {
  return `You are a senior engineer building a polished video walkthrough of a repository.

Repository: ${repoName}
URL: ${repoUrl}

Create a structured walkthrough with 12-18 scenes that a layman can follow.
Use this flow:
1. Why the project exists.
2. Where execution begins.
3. The main architecture.
4. The runtime or data flow.
5. The most important modules (dive deep into each).
6. Supporting details like config, tests, or deployment.
7. A conclusion that tells the viewer what to open next.

Rules:
- Do not invent files.
- Pick files that actually matter, not random source files.
- Explain intent and relationships, not syntax.
- Keep narration and on-screen code tightly aligned.
- code must be an empty string.
- Scene 1 MUST be the intro/hook. The LAST scene MUST be the conclusion. Follow the flow above in order.

NARRATION STYLE — CRITICAL:
- Write narration as SPOKEN WORDS that will be read aloud by a text-to-speech voice.
- NEVER include file paths, directory paths, or slashes in narration. Instead of "src/utils/helper.ts", say "the helper utility". Instead of "src/components/Button.tsx", say "the Button component".
- Refer to files by their PURPOSE: "the main entry point", "the authentication service", "the database config".
- Write like you are explaining to a friend over coffee. Natural, conversational language.
- Do NOT start sentences with "This file" repeatedly. Vary sentence structure.
- Use everyday words. Say "stores data" not "persists entities".
- The narration will be read by TTS — write it so it SOUNDS GOOD spoken aloud.
- Write 60-120 words of narration per scene. Be thorough.
- Duration = ceil(word_count / 2.3) + 3 seconds buffer.
- CRITICAL: Do NOT truncate or cut short. Every scene must have complete narration.
- Total video should be 3-7+ minutes long.

Schema:
{
  "title": "string",
  "repo_files": ["string"],
  "scenes": [
    {
      "id": 1,
      "type": "intro|overview|entry|feature|core|code|support|summary|wrap_up|outro",
      "file_path": "string",
      "highlight_lines": [1, 10],
      "title": "string",
      "narration_text": "string",
      "duration_seconds": 16,
      "code": ""
    }
  ]
}

Repository context:
${digest}

Extra graph hints:
${graphHints || "None"}`;
}

/**
 * Strip file paths and other TTS-unfriendly patterns from narration.
 * E.g. "src/components/Button.tsx" → "the Button module"
 */
function sanitizeNarration(text: string): string {
  let cleaned = text;

  // Replace file paths like "src/utils/helper.ts" or "./components/Button.tsx"
  // with a human-readable name derived from the filename
  cleaned = cleaned.replace(
    /(?:`)?(?:\.\/)?(?:[\w.-]+\/)+(\w[\w.-]*)(?:\.\w{1,5})(?:`)?/g,
    (_match, filename: string) => {
      const humanName = filename
        .replace(/[_-]+/g, ' ')
        .replace(/\.[^/.]+$/, '')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();
      return `the ${humanName} module`;
    }
  );

  // Remove standalone backticks that TTS might read as "backtick"
  cleaned = cleaned.replace(/`/g, '');

  // Replace "slash" paths that might remain (e.g. "src slash utils" or "src backslash utils")
  cleaned = cleaned.replace(/\bsrc\s+(slash|backslash|\/|\\)\s+/gi, 'the ');

  // Catch paths with backslashes
  cleaned = cleaned.replace(/(?:[\w.-]+\\)+(\w[\w.-]*)(?:\.\w{1,5})/g, 'the $1 module');

  // Strip remaining solitary backslashes so TTS doesn't say "backslash"
  cleaned = cleaned.replace(/\\/g, ' ');

  // Clean up double spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
}

function validateScene(scene: VideoScene, fallbackFile: string) {
  const rawNarration = scene.narration_text || "Code walkthrough scene";
  const narrationText = sanitizeNarration(rawNarration);
  const words = narrationText.trim().split(/\s+/).filter(Boolean).length;
  // Use 2.3 words/second + 3s buffer to prevent dialogue truncation
  const requiredDuration = Math.ceil(words / 2.3) + 3;

  return {
    ...scene,
    file_path: scene.file_path || fallbackFile,
    type: scene.type || "code",
    narration_text: narrationText,
    duration_seconds: Math.max(scene.duration_seconds || 15, requiredDuration),
    title: scene.title || humanizeFallbackTitle(scene.file_path || fallbackFile),
    highlight_lines: scene.highlight_lines || [1, 1],
    code: "",
  };
}

function humanizeFallbackTitle(filePath: string) {
  const value = filePath.split("/").pop() || filePath;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\.[^/.]+$/, "")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

async function requestGemini(prompt: string) {
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          topK: 40,
          topP: 0.92,
          maxOutputTokens: 32768,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response from Gemini API");
  }
  return text;
}

export async function generateManifestWithGemini(
  repoUrl: string,
  repoName: string,
  repoContent: string,
  graphData?: GitNexusGraphData | null
): Promise<VideoManifest> {
  if (USE_MOCK_MANIFEST || !GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured or mock mode enabled");
  }

  const fileContents = parseRepoContent(repoContent);
  const availableFiles = Object.keys(fileContents);
  const fallbackFile =
    availableFiles.find((path) => /readme/i.test(path)) ||
    availableFiles[0] ||
    "Unknown";

  const generateWithConfig = async (useGraph: boolean): Promise<VideoManifest> => {
    let importantFiles: string[] = [];
    let graphHints = "";
    let blueprint: ReturnType<typeof buildGraphTutorialBlueprint> = null;
    let prompt = "";

    if (useGraph && graphData) {
      console.log(JSON.stringify({
        event: "graph_loaded",
        nodeCount: graphData.nodes?.length || 0,
        architecture: graphData.summary?.architecturePattern || "unknown",
        technologies: graphData.summary?.keyTechnologies?.join(", ") || "none",
        message: `Code Graph RAG: ${graphData.nodes?.length || 0} nodes, ${graphData.summary?.architecturePattern || "unknown"} architecture`,
      }));

      importantFiles = getImportantFiles(graphData).files;
      graphHints = getGraphHintsForGemini(graphData, fileContents);
      blueprint = buildGraphTutorialBlueprint(graphData, fileContents, repoName);
    }

    if (blueprint) {
      const digest = buildTutorialContextDigest(blueprint, fileContents, MAX_DIGEST_CHARS);
      prompt = buildGraphPrompt(repoUrl, repoName, digest, graphHints, blueprint);
    } else {
      const digest = availableFiles.length > 0
        ? buildStructuredDigest(fileContents, MAX_DIGEST_CHARS, importantFiles)
        : `${repoContent.slice(0, MAX_DIGEST_CHARS)}${repoContent.length > MAX_DIGEST_CHARS ? " ... (truncated)" : ""}`;
      prompt = buildDigestPrompt(repoUrl, repoName, digest, graphHints);
    }

    try {
      const raw = await requestGemini(prompt);
      const parsed = parseGeminiJson<VideoManifest>(raw);

      if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        throw new Error("VALIDATION_FAILED: Invalid or empty manifest scenes array");
      }

      const validated: VideoManifest = {
        ...parsed,
        repo_files: parsed.repo_files?.length ? parsed.repo_files : availableFiles,
        scenes: parsed.scenes.map((scene, index) => validateScene(scene, fallbackFile)).map((scene, index) => ({
          ...scene,
          id: scene.id || index + 1,
        })),
      };

      const finalManifest = blueprint
        ? mergeManifestWithBlueprint(validated, blueprint, fileContents, repoName)
        : validated;

      console.log(JSON.stringify({
        event: "manifest_generated",
        useGraph,
        sceneCount: finalManifest.scenes.length,
        blueprintDriven: Boolean(blueprint),
        message: `Manifest generated ${blueprint ? "with graph blueprint" : "from digest context"}`,
      }));

      return finalManifest;
    } catch (error: any) {
      if (blueprint) {
        console.warn("Gemini output unusable; falling back to graph-backed blueprint manifest.", error);
        return buildManifestFromBlueprint(blueprint, repoName);
      }
      throw error;
    }
  };

  try {
    return await generateWithConfig(true);
  } catch (error: any) {
    if (error.message?.includes("VALIDATION_FAILED")) {
      console.warn("Manifest validation failed with graph context. Retrying in digest-only mode.");
      return generateWithConfig(false);
    }
    throw error;
  }
}

export type { VideoManifest, VideoScene } from "@/lib/types";
