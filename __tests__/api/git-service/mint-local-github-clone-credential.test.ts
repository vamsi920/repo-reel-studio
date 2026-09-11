import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isConfigured: true,
  localConnected: true,
  invokeData: null as { token: string; host: string } | null,
  invokeError: null as { message: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isConfigured;
  },
  supabase: {
    functions: {
      invoke: async () => ({
        data: state.invokeData,
        error: state.invokeError,
      }),
    },
  },
}));

vi.mock("#/api/git-service/github-connection-flag", () => ({
  isLocalGithubConnected: () => state.localConnected,
}));

const createSecret = vi.fn();
vi.mock("#/api/secrets-service", () => ({
  SecretsService: {
    createSecret: (...args: unknown[]) => createSecret(...args),
  },
}));

const { mintLocalGithubCloneCredential, mintGithubCloneToken } = await import(
  "#/api/git-service/mint-local-github-clone-credential"
);

describe("mintLocalGithubCloneCredential", () => {
  beforeEach(() => {
    state.isConfigured = true;
    state.localConnected = true;
    state.invokeData = { token: "gh-token-123", host: "github.com" };
    state.invokeError = null;
    createSecret.mockReset();
    createSecret.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mints and stores the credential, returning the host", async () => {
    await expect(mintLocalGithubCloneCredential("github")).resolves.toBe(
      "github.com",
    );
    expect(createSecret).toHaveBeenCalledWith(
      "GITHUB_TOKEN",
      "gh-token-123",
      "GitHub clone credential (auto-managed)",
    );
  });

  it("returns null for a non-GitHub provider without minting anything", async () => {
    await expect(mintLocalGithubCloneCredential("gitlab")).resolves.toBeNull();
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("returns null when there is no local GitHub connection", async () => {
    state.localConnected = false;
    await expect(mintLocalGithubCloneCredential("github")).resolves.toBeNull();
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("returns null when Supabase is not configured", async () => {
    state.isConfigured = false;
    await expect(mintLocalGithubCloneCredential("github")).resolves.toBeNull();
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("returns null when the mint function invoke errors", async () => {
    state.invokeError = { message: "boom" };
    state.invokeData = null;
    await expect(mintLocalGithubCloneCredential("github")).resolves.toBeNull();
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("returns null when storing the secret throws", async () => {
    createSecret.mockRejectedValue(new Error("store failed"));
    await expect(mintLocalGithubCloneCredential("github")).resolves.toBeNull();
  });
});

describe("mintGithubCloneToken", () => {
  beforeEach(() => {
    state.isConfigured = true;
    state.localConnected = true;
    state.invokeData = { token: "gh-token-123", host: "github.com" };
    state.invokeError = null;
    createSecret.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the raw token and host without storing anything", async () => {
    await expect(mintGithubCloneToken()).resolves.toEqual({
      token: "gh-token-123",
      host: "github.com",
    });
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("returns null when there is no local GitHub connection", async () => {
    state.localConnected = false;
    await expect(mintGithubCloneToken()).resolves.toBeNull();
  });

  it("returns null when the mint function invoke errors", async () => {
    state.invokeError = { message: "boom" };
    state.invokeData = null;
    await expect(mintGithubCloneToken()).resolves.toBeNull();
  });
});
