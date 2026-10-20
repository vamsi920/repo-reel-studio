import { describe, expect, it } from "vitest";
import {
  buildRuntimeProbeCommand,
  connectionEnvValues,
  evaluateRuntimeProbe,
  isPrivateNetworkHost,
  RUNTIME_PROBE_BODY_MARKER,
  runtimeProbeUrls,
} from "#/lib/environment/runtime-connection";
import { getConnectorManifest } from "#/lib/environment/registry";

const gitlab = getConnectorManifest("gitlab-self-managed")!;
const TOKEN = "glpat-test-0000";

describe("private network hosts", () => {
  it.each(["gitlab.northwind.internal", "jira.corp", "10.1.2.3", "gitlab"])(
    "treats %s as reachable only from the company network",
    (host) => {
      expect(isPrivateNetworkHost(host)).toBe(true);
    },
  );

  it.each([
    "gitlab.com",
    "localhost",
    "127.0.0.1",
    "169.254.169.254",
    "metadata.google.internal",
  ])("does not treat %s as a company host", (host) => {
    expect(isPrivateNetworkHost(host)).toBe(false);
  });
});

describe("runtime connection check", () => {
  it("exposes a connection to the agent as named environment variables", () => {
    expect(
      connectionEnvValues(
        gitlab,
        { instanceHost: "gitlab.northwind.internal" },
        { accessToken: TOKEN },
      ),
    ).toEqual({
      GITLAB_SELF_MANAGED_INSTANCE_HOST: "gitlab.northwind.internal",
      GITLAB_SELF_MANAGED_ACCESS_TOKEN: TOKEN,
    });
  });

  it("tries HTTPS before plain HTTP", () => {
    expect(
      runtimeProbeUrls(gitlab, { instanceHost: "gitlab.northwind.internal" }),
    ).toEqual([
      "https://gitlab.northwind.internal/api/v4/version",
      "http://gitlab.northwind.internal/api/v4/version",
    ]);
  });

  it("keeps the credential out of the command line", () => {
    const command = buildRuntimeProbeCommand({
      url: "https://gitlab.northwind.internal/api/v4/version",
      method: "GET",
      headerFile: "/tmp/h",
      bodyFile: "/tmp/b",
      errorFile: "/tmp/e",
    });
    expect(command).toContain("-H @'/tmp/h'");
    expect(command).not.toContain(TOKEN);
  });

  it("passes when the manifest's checks pass", () => {
    const attempt = evaluateRuntimeProbe(
      gitlab,
      "http://gitlab.northwind.internal/api/v4/version",
      `RC=0 CODE=200\n\n${RUNTIME_PROBE_BODY_MARKER}\n{"version":"16.11.2"}`,
    );
    expect(attempt).toMatchObject({
      ok: true,
      httpStatus: 200,
      version: "16.11.2",
    });
  });

  it.each([
    ["RC=6 CODE=000\ncurl: (6) Could not resolve host", "dns"],
    ["RC=60 CODE=000\ncurl: (60) SSL certificate problem", "tls_untrusted"],
    ["RC=0 CODE=407\n", "proxy_auth"],
    [
      `RC=0 CODE=401\n${RUNTIME_PROBE_BODY_MARKER}\n{"message":"401"}`,
      "unauthorized",
    ],
  ])("names the failure for %j", (stdout, failure) => {
    const attempt = evaluateRuntimeProbe(
      gitlab,
      "https://x/api/v4/version",
      stdout,
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.failure).toBe(failure);
  });
});
