import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

export type ArtifactBucket = "workspace-artifacts" | "kt-audio";

/**
 * Both buckets are private (see supabase/migrations/*_storage_buckets.sql) --
 * every read goes through a signed URL, gated by the same workspace-
 * membership RLS policy Storage enforces at signing time. Path convention:
 * `{bucket}/{workspaceId}/{...}` -- the workspace id must be the first path
 * segment for the bucket's RLS policies to authorize the call.
 */
export interface ArtifactStore {
  put(
    bucket: ArtifactBucket,
    path: string,
    body: Blob | ArrayBuffer,
    opts?: { contentType?: string },
  ): Promise<{ ok: boolean; error?: string }>;
  getSignedUrl(
    bucket: ArtifactBucket,
    path: string,
    expiresInSeconds?: number,
  ): Promise<string | null>;
  remove(bucket: ArtifactBucket, path: string): Promise<void>;
}

class SupabaseArtifactStore implements ArtifactStore {
  async put(
    bucket: ArtifactBucket,
    path: string,
    body: Blob | ArrayBuffer,
    opts?: { contentType?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return { ok: true };
    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, body, { contentType: opts?.contentType, upsert: true });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getSignedUrl(
    bucket: ArtifactBucket,
    path: string,
    expiresInSeconds = 3600,
  ): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }

  async remove(bucket: ArtifactBucket, path: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase.storage.from(bucket).remove([path]);
    } catch {
      // Best-effort.
    }
  }
}

export const artifactStore: ArtifactStore = new SupabaseArtifactStore();
