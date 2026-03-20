/**
 * src/lib/storage.ts
 *
 * Single source of truth for Supabase Storage bucket names and object key
 * patterns used across this project.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Bucket: project-audio  (PUBLIC)                                        │
 * │  Object key: project-audio/<project_id>/<scene_id>.mp3                  │
 * │  Upload: authenticated users (Processing page).                         │
 * │  Download: public URL (no signed URL needed).                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Name of the public bucket that stores TTS audio files. */
export const AUDIO_BUCKET = 'project-audio' as const;
export const GRAPH_BUCKET = 'project-graphs' as const;

// ---------------------------------------------------------------------------
// Key-building helpers
// ---------------------------------------------------------------------------

/**
 * Returns the canonical storage object key for a scene's TTS audio.
 *
 * Format: `project-audio/<project_id>/<scene_id>.mp3`
 */
export function audioObjectKey(projectId: string, sceneId: string | number): string {
    return `${projectId}/${sceneId}.mp3`;
}

export function graphArtifactPrefix(projectId: string): string {
    return `${projectId}/codegraph`;
}

export function graphJsonObjectKey(projectId: string): string {
    return `${graphArtifactPrefix(projectId)}/graph.json`;
}

export function graphCsvObjectKey(projectId: string): string {
    return `${graphArtifactPrefix(projectId)}/graph.csv`;
}

// ---------------------------------------------------------------------------
// Frontend helpers (anon / user session client)
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export const audioStorage = {
    /**
     * Returns the public URL for a scene's TTS audio file.
     * The project-audio bucket is public, so no signed URL is needed.
     */
    publicUrl(projectId: string, sceneId: string | number): string {
        const key = audioObjectKey(projectId, sceneId);
        const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(key);
        return data.publicUrl;
    },
};

export const graphStorage = {
    publicUrlForKey(key: string): string {
        const { data } = supabase.storage.from(GRAPH_BUCKET).getPublicUrl(key);
        return data.publicUrl;
    },
};
