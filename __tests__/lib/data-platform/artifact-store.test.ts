import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  uploadError: null as { message: string } | null,
  signedUrlData: null as { signedUrl: string } | null,
  signedUrlError: null as { message: string } | null,
  uploadCall: null as
    | { bucket: string; path: string; body: unknown; options: unknown }
    | null,
  removedCall: null as { bucket: string; paths: string[] } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, body: unknown, options: unknown) => {
          state.uploadCall = { bucket, path, body, options };
          return Promise.resolve({ error: state.uploadError });
        },
        createSignedUrl: () =>
          Promise.resolve({
            data: state.signedUrlData,
            error: state.signedUrlError,
          }),
        remove: (paths: string[]) => {
          state.removedCall = { bucket, paths };
          return Promise.resolve({ error: null });
        },
      }),
    },
  },
}));

const { artifactStore } = await import("#/lib/data-platform/artifact-store");

describe("artifactStore.put", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.uploadError = null;
    state.uploadCall = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads with upsert and returns ok on success", async () => {
    const body = new Blob(["data"]);
    await expect(
      artifactStore.put("workspace-artifacts", "ws-1/file.txt", body, {
        contentType: "text/plain",
      }),
    ).resolves.toEqual({ ok: true });
    expect(state.uploadCall).toEqual({
      bucket: "workspace-artifacts",
      path: "ws-1/file.txt",
      body,
      options: { contentType: "text/plain", upsert: true },
    });
  });

  it("returns ok:false with the error message when the upload fails", async () => {
    state.uploadError = { message: "storage quota exceeded" };
    await expect(
      artifactStore.put("kt-audio", "ws-1/clip.mp3", new Blob()),
    ).resolves.toEqual({ ok: false, error: "storage quota exceeded" });
  });

  it("short-circuits to ok:true when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await expect(
      artifactStore.put("workspace-artifacts", "ws-1/file.txt", new Blob()),
    ).resolves.toEqual({ ok: true });
    expect(state.uploadCall).toBeNull();
  });
});

describe("artifactStore.getSignedUrl", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.signedUrlData = null;
    state.signedUrlError = null;
  });

  it("returns the signed URL on success", async () => {
    state.signedUrlData = { signedUrl: "https://example.test/signed" };
    await expect(
      artifactStore.getSignedUrl("workspace-artifacts", "ws-1/file.txt"),
    ).resolves.toBe("https://example.test/signed");
  });

  it("returns null when the call errors", async () => {
    state.signedUrlError = { message: "not found" };
    await expect(
      artifactStore.getSignedUrl("workspace-artifacts", "ws-1/missing.txt"),
    ).resolves.toBeNull();
  });

  it("returns null when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await expect(
      artifactStore.getSignedUrl("workspace-artifacts", "ws-1/file.txt"),
    ).resolves.toBeNull();
  });
});

describe("artifactStore.remove", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.removedCall = null;
  });

  it("removes the given path from the bucket", async () => {
    await artifactStore.remove("kt-audio", "ws-1/clip.mp3");
    expect(state.removedCall).toEqual({
      bucket: "kt-audio",
      paths: ["ws-1/clip.mp3"],
    });
  });

  it("is a no-op when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await artifactStore.remove("kt-audio", "ws-1/clip.mp3");
    expect(state.removedCall).toBeNull();
  });
});
