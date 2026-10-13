import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkGithubCredential,
  checkGithubRepository,
  listGithubRepositories,
} from "#/api/git-service/github-credential-health";
import { SecretsService } from "#/api/secrets-service";

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

  it.each([
    // A revoked OAuth token: every automation run would inherit it.
    [401, "rejected"],
    [200, "ok"],
    // Rate limits and outages say nothing about the credential.
    [403, "unknown"],
    [502, "unknown"],
  ])("maps GitHub status %s to %s", async (status, expected) => {
    storedToken("gho_x");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status }),
    );

    await expect(checkGithubCredential()).resolves.toBe(expected);
  });

  it("reports a missing credential without calling GitHub", async () => {
    storedToken(null);
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
