import { GOOGLE_TTS_API_KEY, GOOGLE_TTS_ENABLED } from '@/env';
import type { VideoScene } from './types';

interface GoogleTTSRequest {
  input: {
    text: string;
  };
  voice: {
    languageCode: string;
    name: string;
    ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  };
  audioConfig: {
    audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
    speakingRate?: number;
    pitch?: number;
    volumeGainDb?: number;
    sampleRateHertz?: number;
  };
}

interface GoogleTTSResponse {
  audioContent: string; // Base64 encoded audio
}

type TTSFailure = {
  sceneId: number;
  error: string;
};

type TTSGenerationResult = {
  audioUrls: Map<number, string>;
  failures: TTSFailure[];
};

const DEFAULT_TTS_PROXY_URL = "/api/tts";
const TTS_PROXY_URL = import.meta.env.VITE_TTS_PROXY_URL || DEFAULT_TTS_PROXY_URL;

const normalizeNarrationText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const normalizeToken = (value: string) =>
    value.replace(/[^\w]+/g, "").toLowerCase();

  let cleaned = trimmed.replace(/\s+/g, " ");

  const sentenceParts = cleaned.split(/(?<=[.!?])\s+/);
  if (sentenceParts.length > 1) {
    const dedupedSentences: string[] = [];
    for (const part of sentenceParts) {
      const normalized = normalizeToken(part);
      const last = dedupedSentences[dedupedSentences.length - 1];
      if (!last || normalizeToken(last) !== normalized) {
        dedupedSentences.push(part);
      }
    }
    cleaned = dedupedSentences.join(" ").trim();
  }

  const words = cleaned.split(" ");
  if (words.length % 2 === 0 && words.length >= 6) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half);
    const secondHalf = words.slice(half);
    const isDuplicate = firstHalf.every(
      (word, index) => normalizeToken(word) === normalizeToken(secondHalf[index] || "")
    );
    if (isDuplicate) {
      cleaned = firstHalf.join(" ");
    }
  }

  const tokens = cleaned.split(/\s+/);
  if (tokens.length < 4) return tokens.join(" ");

  let duplicates = 0;
  for (let i = 1; i < tokens.length; i += 1) {
    if (normalizeToken(tokens[i]) === normalizeToken(tokens[i - 1])) {
      duplicates += 1;
    }
  }

  const duplicateRatio = duplicates / tokens.length;
  if (duplicateRatio < 0.1) {
    return tokens.join(" ");
  }

  const deduped: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (i === 0 || normalizeToken(tokens[i]) !== normalizeToken(tokens[i - 1])) {
      deduped.push(tokens[i]);
    }
  }
  return deduped.join(" ");
};

const buildProxyPayload = (requestBody: GoogleTTSRequest) => ({
  ...requestBody,
  apiKey: GOOGLE_TTS_API_KEY || undefined,
});

const parseErrorResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await response.json();
    return JSON.stringify(body);
  }
  return response.text();
};

const requestTTS = async (requestBody: GoogleTTSRequest): Promise<GoogleTTSResponse> => {
  let proxyError: unknown;

  try {
    const proxyResponse = await fetch(TTS_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildProxyPayload(requestBody)),
    });

    if (!proxyResponse.ok) {
      const errorText = await parseErrorResponse(proxyResponse);
      throw new Error(`Proxy TTS error: ${proxyResponse.status} - ${errorText}`);
    }

    const data: GoogleTTSResponse = await proxyResponse.json();
    if (!data.audioContent) {
      throw new Error("No audio content in proxy response");
    }
    return data;
  } catch (error) {
    proxyError = error;
  }

  if (!GOOGLE_TTS_API_KEY) {
    throw proxyError instanceof Error ? proxyError : new Error("Google TTS API key not configured");
  }

  const directResponse = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!directResponse.ok) {
    const errorText = await parseErrorResponse(directResponse);
    const proxyMessage = proxyError instanceof Error ? proxyError.message : "";
    const combined = proxyMessage ? `${proxyMessage}; Direct TTS error: ${directResponse.status} - ${errorText}` : `Google TTS API error: ${directResponse.status} - ${errorText}`;
    throw new Error(combined);
  }

  const data: GoogleTTSResponse = await directResponse.json();
  if (!data.audioContent) {
    throw new Error("No audio content in direct response");
  }
  return data;
};

/**
 * Generate audio for a single scene using Google Cloud TTS
 * @param scene - Video scene with narration text
 * @param voiceName - Voice name (default: 'en-US-Standard-D' for male, 'en-US-Standard-F' for female)
 * @returns Blob URL for the generated audio
 */
export async function generateSceneAudio(
  scene: VideoScene,
  voiceName: string = 'en-US-Standard-D'
): Promise<string> {
  if (!GOOGLE_TTS_ENABLED && !GOOGLE_TTS_API_KEY) {
    throw new Error('Google TTS API key not configured. Set VITE_GOOGLE_TTS_API_KEY in your .env file.');
  }

  const narrationText = normalizeNarrationText(scene.narration_text || "");
  if (!narrationText) {
    throw new Error('Scene has no narration text');
  }

  const requestBody: GoogleTTSRequest = {
    input: {
      text: narrationText,
    },
    voice: {
      languageCode: 'en-US',
      name: voiceName,
      ssmlGender: voiceName.includes('F') ? 'FEMALE' : 'MALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0.0,
      volumeGainDb: 0.0,
      sampleRateHertz: 24000,
    },
  };

  try {
    const data = await requestTTS(requestBody);
    const audioBytes = Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0));
    const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
    return URL.createObjectURL(audioBlob);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to generate audio for scene ${scene.id}:`, errorMessage);
    
    // Provide helpful error messages
    if (errorMessage.includes('API_KEY_SERVICE_BLOCKED') || errorMessage.includes('403')) {
      throw new Error('Google TTS API key is blocked or invalid. Please check your API key configuration and ensure the Text-to-Speech API is enabled in Google Cloud Console.');
    } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      throw new Error('TTS proxy endpoint not found. The /api/tts endpoint may not be configured on your server.');
    } else if (errorMessage.includes('quota') || errorMessage.includes('429')) {
      throw new Error('Google TTS API quota exceeded. Please check your quota limits in Google Cloud Console.');
    }
    
    throw error;
  }
}

/**
 * Generate audio for all scenes with progress tracking
 * @param scenes - Array of video scenes
 * @param voiceName - Voice name (default: 'en-US-Standard-D')
 * @param onProgress - Progress callback (completed, total)
 * @param batchSize - Number of scenes to generate in parallel (default: 3)
 * @returns Object with audio URLs and failures
 */
export async function generateAllSceneAudio(
  scenes: VideoScene[],
  voiceName: string = 'en-US-Standard-D',
  onProgress?: (completed: number, total: number) => void,
  batchSize: number = 3
): Promise<TTSGenerationResult> {
  if (!GOOGLE_TTS_ENABLED && !GOOGLE_TTS_API_KEY) {
    console.warn('Google TTS not enabled, skipping audio generation');
    console.warn('To enable TTS, set VITE_GOOGLE_TTS_API_KEY in your .env file');
    return { audioUrls: new Map(), failures: [] };
  }

  const audioUrls = new Map<number, string>();
  const audioCache = new Map<string, string>();
  const failures: TTSFailure[] = [];
  const total = scenes.length;
  let completed = 0;

  // Process scenes in batches to avoid overwhelming the API
  for (let i = 0; i < scenes.length; i += batchSize) {
    const batch = scenes.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (scene) => {
      try {
        const narrationKey = normalizeNarrationText(scene.narration_text || "");
        if (!narrationKey) {
          throw new Error("Scene has no narration text after normalization");
        }

        const cachedAudio = audioCache.get(narrationKey);
        if (cachedAudio) {
          audioUrls.set(scene.id, cachedAudio);
          completed++;
          onProgress?.(completed, total);
          return { sceneId: scene.id, success: true, cached: true };
        }

        const audioUrl = await generateSceneAudio(scene, voiceName);
        audioUrls.set(scene.id, audioUrl);
        audioCache.set(narrationKey, audioUrl);
        completed++;
        onProgress?.(completed, total);
        return { sceneId: scene.id, success: true };
      } catch (error) {
        console.error(`Failed to generate audio for scene ${scene.id}:`, error);
        completed++;
        failures.push({
          sceneId: scene.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        onProgress?.(completed, total);
        return { sceneId: scene.id, success: false, error };
      }
    });

    await Promise.all(batchPromises);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < scenes.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Don't throw if all scenes fail - just return empty results
  // This allows the video to render without audio
  if (audioUrls.size === 0 && failures.length > 0) {
    console.warn(`TTS failed for all ${failures.length} scenes. Video will continue without audio.`);
    console.warn('Common causes:');
    console.warn('  1. Google TTS API key not configured or blocked');
    console.warn('  2. TTS proxy endpoint not available (/api/tts)');
    console.warn('  3. API quota exceeded or service disabled');
    console.warn('  4. Network connectivity issues');
  }

  return { audioUrls, failures };
}

/**
 * Get available Google TTS voices
 * @returns Array of voice names
 */
export async function getAvailableVoices(): Promise<string[]> {
  if (!GOOGLE_TTS_ENABLED || !GOOGLE_TTS_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?key=${GOOGLE_TTS_API_KEY}&languageCode=en-US`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status}`);
    }

    const data = await response.json();
    return data.voices?.map((v: any) => v.name) || [];
  } catch (error) {
    console.error('Failed to fetch available voices:', error);
    return [];
  }
}
