import { GEMINI_API_BASE, GEMINI_API_KEY, GEMINI_MODEL } from "@/env";

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

export interface GeminiRequestOptions {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  /** Fail fast with a clear message when no API key is configured. */
  requireApiKey?: boolean;
}

export const requestGemini = async (
  prompt: string,
  options: GeminiRequestOptions = {}
): Promise<string> => {
  const {
    temperature = 0.25,
    topK = 32,
    topP = 0.9,
    maxOutputTokens = 4096,
    requireApiKey = false,
  } = options;

  if (requireApiKey && !GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

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
          temperature,
          topK,
          topP,
          maxOutputTokens,
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
};

export const stripMarkdownFence = (value: string): string => {
  if (!value.startsWith("```")) return value;
  return value.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
};

/** Recovers a truncated `{"scenes": [...]}` payload by closing the array at the last complete entry. */
const salvageTruncatedScenes = <T,>(text: string): T | null => {
  const scenesStart = text.indexOf('"scenes"');
  if (scenesStart === -1) return null;
  const arrayStart = text.indexOf("[", scenesStart);
  const lastCompleteScene = text.lastIndexOf("},");
  const lastBrace = text.lastIndexOf("}");
  const cutAt = lastCompleteScene !== -1 ? lastCompleteScene + 1 : lastBrace;
  if (arrayStart === -1 || cutAt === -1 || cutAt <= arrayStart) return null;
  return JSON.parse(`${text.slice(0, cutAt)}]}`) as T;
};

export const parseGeminiJson = <T,>(raw: string): T => {
  const text = stripMarkdownFence(raw.trim());

  try {
    return JSON.parse(text) as T;
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as T;
      } catch {
        // fall through to scene salvage
      }
    }

    const salvaged = salvageTruncatedScenes<T>(text);
    if (salvaged) return salvaged;

    throw new Error("Could not parse JSON from Gemini response");
  }
};
