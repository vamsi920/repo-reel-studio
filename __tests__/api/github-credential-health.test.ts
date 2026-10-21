import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkGithubCredential,
  checkGithubRepository,
  listGithubRepositories,
} from "#/api/git-service/github-credential-health";
import { SecretsService } from "#/api/secrets-service";
import * as mint from "#/api/git-service/mint-local-github-clone-credential";

const { getSecret } = vi.hoisted(() => ({ getSecret: vi.fn() }));
vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: class {
    getSecret = getSecret;
  },
}));

describe("checkGithubCredential", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getSecret.mockReset();
  });

  function storedToken(value: string | null) {
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue(
      value === null ? [] : [{ name: "GITHUB_TOKEN" }],
    );
    getSecret.mockResolvedValue(value);
  }

  function savedLogin(token: string | null) {
    return vi
      .spyOn(mint, "mintGithubCloneToken")
      .mockResolvedValue(token ? { token, host: "github.com" } : null);
  }

  function githubAccepts(goodToken: string) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const auth = new Headers(init?.headers).get("Authorization");
      return new Response("{}", {
        status: auth === `Bearer ${goodToken}` ? 200 : 401,
      });
    });
  }

  it("replaces a stale agent-server copy with the saved login instead of warning", async () => {
    storedToken("gho_old");
    savedLogin("gho_new");
    githubAccepts("gho_new");
    const save = vi
      .spyOn(SecretsService, "createSecret")
      .mockResolvedValue(undefined);

    await expect(checkGithubCredential()).resolves.toBe("ok");
    expect(save).toHaveBeenCalledWith(
      "GITHUB_TOKEN",
      "gho_new",
      expect.any(String),
    );
  });

  it("warns only when the saved login itself is refused", async () => {
    storedToken("gho_old");
    savedLogin("gho_new");
    githubAccepts("gho_other");
    const save = vi.spyOn(SecretsService, "createSecret");

    await expect(checkGithubCredential()).resolves.toBe("rejected");
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    // A revoked OAuth token, and no newer saved login to replace it.
    [401, "rejected"],
    [200, "ok"],
    // Rate limits and outages say nothing about the credential.
    [403, "unknown"],
    [502, "unknown"],
  ])("maps GitHub status %s to %s", async (status, expected) => {
    storedToken("gho_x");
    savedLogin(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status }),
    );

    await expect(checkGithubCredential()).resolves.toBe(expected);
  });

  it("reports a missing credential without calling GitHub", async () => {
    storedToken(null);
    savedLogin(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(checkGithubCredential()).resolves.toBe("missing");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("checkGithubRepository", () => {
    it.each([
      [200, "exists"],
      [404, "missing"],
      // A rejected credential cannot tell; the health banner reports it.
      [401, "unknown"],
    ])("maps GitHub status %s to %s", async (status, expected) => {
      storedToken("gho_x");
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}", { status }));

      await expect(checkGithubRepository("acme/app")).resolves.toBe(expected);
      expect(fetchSpy.mock.calls[0][0]).toBe(
        "https://api.github.com/repos/acme/app",
      );
    });

    it("never blocks without a stored credential", async () => {
      storedToken(null);

      await expect(checkGithubRepository("acme/app")).resolves.toBe("unknown");
    });
  });

  it("suggests the repositories the credential can see, and none without one", async () => {
    storedToken("gho_x");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([{ full_name: "acme/app" }, { full_name: "acme/web" }]),
        { status: 200 },
      ),
    );
    await expect(listGithubRepositories()).resolves.toEqual([
      "acme/app",
      "acme/web",
    ]);

    storedToken(null);
    await expect(listGithubRepositories()).resolves.toEqual([]);
  });
});
