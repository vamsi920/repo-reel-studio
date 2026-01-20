import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_API_BASE, USE_MOCK_MANIFEST } from '@/env';
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

/**
 * Generate a video manifest using Gemini AI
 */
export async function generateManifestWithGemini(
  repoUrl: string,
  repoName: string,
  repoContent: string
): Promise<VideoManifest> {
  if (USE_MOCK_MANIFEST || !GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured or mock mode enabled');
  }

  const prompt = `You are a video director creating a code walkthrough video. Analyze the following repository and create a detailed video manifest.

Repository: ${repoName}
URL: ${repoUrl}

Repository Content:
${repoContent.substring(0, 50000)} ${repoContent.length > 50000 ? '... (truncated)' : ''}

Create a video manifest with the following structure:
- title: A descriptive title for the video
- scenes: An array of scenes, each with:
  - id: Sequential number starting from 1
  - type: One of "intro", "overview", "entry", "feature", "code", "summary", "outro"
  - file_path: The file path being shown
  - highlight_lines: [start_line, end_line] array (optional)
  - narration_text: Engaging narration explaining what's happening (2-3 sentences)
  - duration_seconds: Duration in seconds (typically 12-18 seconds)
  - title: Scene title
  - code: The actual code snippet from the file (if applicable)

Create 8-15 scenes that tell a compelling story about the codebase. Start with an intro, then show key files and features, and end with a summary.

Return ONLY valid JSON in this exact format:
{
  "title": "...",
  "scenes": [
    {
      "id": 1,
      "type": "intro",
      "file_path": "...",
      "highlight_lines": [1, 10],
      "narration_text": "...",
      "duration_seconds": 15,
      "title": "...",
      "code": "..."
    }
  ]
}`;

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
            temperature: 0.7,
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
