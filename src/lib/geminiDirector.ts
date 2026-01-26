import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_API_BASE, USE_MOCK_MANIFEST } from '@/env';
import { parseRepoContent } from '@/lib/parseRepoContent';
import type { VideoManifest, VideoScene } from './types';

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

const MAX_DIGEST_CHARS = 20_000;
const LINES_PER_EXCERPT = 120;

function buildStructuredDigest(
  fileContents: Record<string, string>,
  maxChars: number
): string {
  const paths = Object.keys(fileContents).sort();
  const fileList = paths.join('\n');

  const readme = paths.find((p) => /readme/i.test(p));
  const entry = paths.find(
    (p) =>
      /(^|\/)(index|main|app)\.(t|j)sx?$/i.test(p) ||
      /src\/(App|main)\.[tj]sx?$/i.test(p) ||
      /(^|\/)app\.(t|j)sx?$/i.test(p)
  );
  const rest = paths.filter((p) => p !== readme && p !== entry).slice(0, 5);
  const keyPaths = [readme, entry, ...rest].filter(Boolean) as string[];

  const excerpts: string[] = [];
  for (const p of keyPaths) {
    const raw = fileContents[p] || '';
    const lines = raw.split(/\r?\n/).slice(0, LINES_PER_EXCERPT).join('\n');
    excerpts.push(`--- ${p} ---\n${lines}`);
  }
  const excerptBlock = excerpts.join('\n\n');

  let out = `FILES:\n${fileList}\n\nEXCERPTS (first ${LINES_PER_EXCERPT} lines of key files):\n${excerptBlock}`;
  if (out.length > maxChars) {
    out = out.substring(0, maxChars) + '\n... (truncated)';
  }
  return out;
}

/**
 * Generate a video manifest using Gemini AI.
 * Uses a compact structured digest (file list + key excerpts) to reduce tokens.
 */
export async function generateManifestWithGemini(
  repoUrl: string,
  repoName: string,
  repoContent: string
): Promise<VideoManifest> {
  if (USE_MOCK_MANIFEST || !GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured or mock mode enabled');
  }

  const fileContents = parseRepoContent(repoContent);
  const input =
    Object.keys(fileContents).length > 0
      ? buildStructuredDigest(fileContents, MAX_DIGEST_CHARS)
      : repoContent.substring(0, MAX_DIGEST_CHARS) +
        (repoContent.length > MAX_DIGEST_CHARS ? ' ... (truncated)' : '');

  const prompt = `You are a video director. Create a ~3-minute codebase explainer: high-level first, then go deeper by layers/modules, then cover the main modules, then wrap up. Use ONLY the FILES and EXCERPTS below.

Repo: ${repoName} | URL: ${repoUrl}

${input}

RULES:
- 12–18 scenes. Total runtime ~3 min. Each narration 40–70 words (3–5 sentences). Be explanatory: what the file does, how it fits the architecture, and one concrete detail.
- Order: (1) intro/overview + README or entry, (2) core logic (lib, services, ai, agents), (3) data/state (db, api, store), (4) infra (auth, config, deploy), (5) summary/outro.
- type: "intro"|"overview"|"entry"|"feature"|"code"|"summary"|"outro"
- highlight_lines: [start,end] for the most relevant block. Omit or [1,1] if not applicable.
- duration_seconds: 12–20 per scene (align with narration length; ~2.5 words/sec).
- code: leave empty string ""; it will be filled later. Use file_path from FILES.

Return ONLY valid JSON:
{"title":"...","scenes":[{"id":1,"type":"intro","file_path":"...","highlight_lines":[1,10],"narration_text":"...","duration_seconds":15,"title":"...","code":""}]}`;

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.6,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
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
      throw new Error('No response from Gemini API');
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = text.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    // Try to parse JSON
    let manifest: VideoManifest;
    try {
      manifest = JSON.parse(jsonText);
    } catch (parseError) {
      // Try to extract JSON object from text
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        manifest = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON from Gemini response');
      }
    }

    // Validate manifest structure
    if (!manifest.title || !manifest.scenes || !Array.isArray(manifest.scenes)) {
      throw new Error('Invalid manifest structure from Gemini');
    }

    // Ensure all scenes have required fields
    manifest.scenes = manifest.scenes.map((scene, index) => ({
      ...scene,
      id: scene.id || index + 1,
      duration_seconds: scene.duration_seconds || 15,
      type: scene.type || 'code',
      narration_text: scene.narration_text || 'Code walkthrough scene',
      title: scene.title || scene.file_path || `Scene ${index + 1}`,
    }));

    return manifest;
  } catch (error) {
    console.error('Gemini manifest generation failed:', error);
    throw error;
  }
}

// Re-export types for backward compatibility
export type { VideoManifest, VideoScene } from './types';
