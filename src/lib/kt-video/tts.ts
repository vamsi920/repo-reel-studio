/**
 * Narration audio for tutorial beats, called directly from the browser.
 *
 * Two providers, tried in order per beat:
 *  1. Google Cloud Text-to-Speech with the optional `VITE_GOOGLE_TTS_API_KEY`
 *     (Chirp 3 HD voice; the key the original reel-studio pipeline used).
 *  2. Gemini's native speech model with the app's required
 *     `VITE_GEMINI_API_KEY` (raw 24 kHz PCM wrapped into a WAV blob here),
 *     so every install with a working Gemini key gets a real voice even
 *     when no Cloud TTS key exists or that key is not enabled for the API.
 *
 * Each beat becomes one blob URL whose real duration drives the beat's
 * timing, so picture and voice stay in sync. When both providers fail, the
 * caller falls back to the browser's speech synthesis and estimated timing.
 */
import type { TutorialAudioClip, TutorialBeat } from "./tutorial-types";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const GEMINI_TTS_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;
export const DEFAULT_GEMINI_VOICE = "Charon";
const GEMINI_STYLE_HINT =
  "Read this narration for a developer onboarding screencast: warm, clear, unhurried, like a senior engineer explaining to a teammate. Read identifiers naturally.";
export const DEFAULT_TTS_VOICE = "en-US-Chirp3-HD-Charon";
const FALLBACK_TTS_VOICE = "en-US-Neural2-D";
const CONCURRENCY = 4;

const clipCache = new Map<string, TutorialAudioClip>();

export function getTtsApiKey(): string | null {
  const key = import.meta.env.VITE_GOOGLE_TTS_API_KEY as string | undefined;
  return key?.trim() ? key.trim() : null;
}

export function getTtsVoice(): string {
  const voice = import.meta.env.VITE_GOOGLE_TTS_VOICE as string | undefined;
  return voice?.trim() ? voice.trim() : DEFAULT_TTS_VOICE;
}

export function getGeminiApiKey(): string | null {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return key?.trim() ? key.trim() : null;
}

export function getGeminiVoice(): string {
  const voice = import.meta.env.VITE_GEMINI_TTS_VOICE as string | undefined;
  return voice?.trim() ? voice.trim() : DEFAULT_GEMINI_VOICE;
}

export function isTtsAvailable(): boolean {
  return getTtsApiKey() !== null || getGeminiApiKey() !== null;
}

/** Wraps raw 16-bit little-endian PCM in a RIFF/WAV header. */
export function pcmToWav(
  pcm: Uint8Array,
  sampleRate: number,
  channels = 1,
): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  const byteRate = sampleRate * channels * 2;
  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm.buffer as ArrayBuffer], { type: "audio/wav" });
}

async function synthesizeWithGemini(
  text: string,
  apiKey: string,
  voice: string,
): Promise<Blob> {
  const response = await fetch(
    `${GEMINI_TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${GEMINI_STYLE_HINT}\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini TTS ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    candidates?: {
      content?: {
        parts?: { inlineData?: { mimeType?: string; data?: string } }[];
      };
    }[];
  };
  const inline = data.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data,
  )?.inlineData;
  if (!inline?.data) throw new Error("Gemini TTS returned no audio");
  const bytes = Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0));
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? "")?.[1] ?? 24000);
  if (/pcm|L16/i.test(inline.mimeType ?? "")) return pcmToWav(bytes, rate);
  return new Blob([bytes], { type: inline.mimeType ?? "audio/wav" });
}

/** Identifiers and paths read better when the voice gets a hint. */
export function speechFriendly(text: string): string {
  return text
    .replace(
      /\b([A-Za-z0-9_-]+)\.(ts|tsx|js|jsx|py|go|rs|java|rb|md|json|yml|yaml)\b/g,
      "$1 dot $2",
    )
    .replace(/\//g, " slash ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function measureDuration(
  url: string,
  fallbackSeconds: number,
): Promise<number> {
  if (typeof Audio === "undefined") return fallbackSeconds;
  return new Promise((resolve) => {
    const audio = new Audio();
    const done = (value: number) => {
      audio.removeAttribute("src");
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      done(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : fallbackSeconds,
      );
    };
    audio.onerror = () => done(fallbackSeconds);
    audio.src = url;
  });
}

async function synthesizeOnce(
  text: string,
  apiKey: string,
  voice: string,
): Promise<Blob> {
  const response = await fetch(
    `${TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: voice.split("-").slice(0, 2).join("-"),
          name: voice,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
          sampleRateHertz: 24000,
        },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TTS ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error("TTS returned no audio");
  const bytes = Uint8Array.from(atob(data.audioContent), (c) =>
    c.charCodeAt(0),
  );
  return new Blob([bytes], { type: "audio/mpeg" });
}

export interface TtsResult {
  clips: Record<string, TutorialAudioClip>;
  failures: string[];
}

/**
 * Synthesises every beat (cached by narration text within the tab).
 * Voice fallback: if the configured voice is rejected, the remaining beats
 * use a standard Neural2 voice so one unavailable voice never kills audio.
 */
export async function synthesizeBeats(
  beats: TutorialBeat[],
  onProgress?: (completed: number, total: number) => void,
): Promise<TtsResult> {
  const cloudKey = getTtsApiKey();
  const geminiKey = getGeminiApiKey();
  const clips: Record<string, TutorialAudioClip> = {};
  const failures: string[] = [];
  if (!cloudKey && !geminiKey)
    return { clips, failures: beats.map((b) => b.id) };

  // Cloud TTS is tried first when configured; after its first hard failure
  // (key not enabled for the API, quota) every remaining beat goes straight
  // to Gemini so one blocked key doesn't cost a round trip per beat.
  let cloudUsable = Boolean(cloudKey);
  let voice = getTtsVoice();
  const geminiVoice = getGeminiVoice();
  const synthesize = async (text: string): Promise<Blob> => {
    if (cloudUsable && cloudKey) {
      try {
        try {
          return await synthesizeOnce(text, cloudKey, voice);
        } catch (error) {
          if (
            voice !== FALLBACK_TTS_VOICE &&
            /400|INVALID_ARGUMENT|voice/i.test(String(error))
          ) {
            voice = FALLBACK_TTS_VOICE;
            return await synthesizeOnce(text, cloudKey, voice);
          }
          throw error;
        }
      } catch (error) {
        if (!geminiKey) throw error;
        cloudUsable = false;
      }
    }
    if (!geminiKey) throw new Error("no TTS provider");
    return synthesizeWithGemini(text, geminiKey, geminiVoice);
  };
  let completed = 0;
  let next = 0;

  const work = async () => {
    while (next < beats.length) {
      const beat = beats[next];
      next += 1;
      const text = speechFriendly(beat.narration);
      const cacheKey = `${cloudUsable ? voice : `gemini:${geminiVoice}`}::${text}`;
      const cached = clipCache.get(cacheKey);
      if (cached) {
        clips[beat.id] = cached;
      } else {
        try {
          const blob = await synthesize(text);
          const url = URL.createObjectURL(blob);
          const estimate = text.split(/\s+/).length / 2.45;
          const durationSeconds = await measureDuration(url, estimate);
          const clip = { url, durationSeconds };
          clipCache.set(cacheKey, clip);
          clips[beat.id] = clip;
        } catch {
          failures.push(beat.id);
        }
      }
      completed += 1;
      onProgress?.(completed, beats.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, beats.length) }, work),
  );
  return { clips, failures };
}
