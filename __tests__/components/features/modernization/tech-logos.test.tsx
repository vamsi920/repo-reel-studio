import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  KNOWN_TECH_LOGO_IDS,
  TechLogo,
  resolveTechLogoId,
  techLabel,
} from "#/components/features/modernization/tech-logos";
import { NEOME_SYSTEM_BRIEF } from "#/components/features/modernization/brief";
import { MODERNIZATION_CONTROL_CLIENT_TOOL } from "#/api/modernization-control-client-tool";
import { MODERNIZATION_CONTROL_COMMANDS } from "#/constants/modernization-control";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasReaMcpServer,
  reaServerForMode,
  REA_MCP_SERVER,
  REA_MCP_ENV,
  REA_MCP_SERVER_BAKED,
  REA_VERSION,
} from "#/lib/modernization/rea-mcp";

describe("tech logos", () => {
  it.each([
    ["Next.js", "nextjs"],
    ["node", "nodejs"],
    ["C#", "csharp"],
    ["ASP.NET Core", "dotnet"],
    ["Postgres", "postgresql"],
    ["Ruby on Rails", "rails"],
    ["FastAPI", "fastapi"],
    ["COBOL", null],
    ["", null],
  ])("resolves %s → %s", (input, expected) => {
    expect(resolveTechLogoId(input)).toBe(expected);
  });

  it("renders a brand logo for a known id and a generic fallback otherwise", () => {
    render(
      <>
        <TechLogo id="python" />
        <TechLogo id="cobol" kind="backend" />
      </>,
    );
    expect(screen.getByTestId("tech-logo-python")).toHaveAttribute(
      "aria-label",
      "Python",
    );
    expect(screen.getByTestId("tech-logo-fallback")).toBeInTheDocument();
    expect(techLabel("rails")).toBe("Ruby on Rails");
    expect(techLabel("Zig")).toBe("Zig");
  });

  it("lists every logo id in the agent brief so the agent can reference them", () => {
    for (const id of KNOWN_TECH_LOGO_IDS) {
      expect(NEOME_SYSTEM_BRIEF).toContain(id);
    }
    expect(NEOME_SYSTEM_BRIEF).toContain(`rea-agents@${REA_VERSION}`);
  });
});

describe("modernization_control schema", () => {
  it("is a thin envelope whose command enum matches the constants", () => {
    const params = MODERNIZATION_CONTROL_CLIENT_TOOL.parameters as {
      properties: { command: { enum: string[] } };
      required: string[];
      additionalProperties: boolean;
    };
    expect(params.properties.command.enum).toEqual([
      ...MODERNIZATION_CONTROL_COMMANDS,
    ]);
    expect(params.required).toEqual(["command"]);
    expect(params.additionalProperties).toBe(false);
    expect(Object.keys(params.properties).sort()).toEqual([
      "command",
      "payload",
      "rationale",
    ]);
  });
});

describe("REA MCP registration", () => {
  it("uses the pre-installed rea binary on Docker backends and npx elsewhere", () => {
    expect(reaServerForMode("docker")).toEqual(REA_MCP_SERVER_BAKED);
    expect(REA_MCP_SERVER_BAKED).toMatchObject({
      command: "rea",
      args: ["mcp"],
    });
    expect(reaServerForMode("dev:automation")).toEqual(REA_MCP_SERVER);
    expect(reaServerForMode(null)).toEqual(REA_MCP_SERVER);
    // A stored npx entry is stale on a Docker backend and gets rewritten.
    expect(hasReaMcpServer({ rea: REA_MCP_SERVER }, REA_MCP_SERVER_BAKED)).toBe(
      false,
    );
    expect(
      hasReaMcpServer({ rea: REA_MCP_SERVER_BAKED }, REA_MCP_SERVER_BAKED),
    ).toBe(true);
  });

  it("bakes the same REA version into the Docker image the app pins", () => {
    const dockerfile = readFileSync(
      resolve(__dirname, "../../../../docker/Dockerfile"),
      "utf8",
    );
    expect(dockerfile).toContain(`ARG REA_VERSION=${REA_VERSION}`);
    expect(dockerfile).toContain("/usr/local/bin/rea");
  });

  it("detects the pinned stdio server and nothing else", () => {
    expect(hasReaMcpServer({ rea: REA_MCP_SERVER })).toBe(true);
    // The settings API echoes env values redacted; that still matches.
    expect(
      hasReaMcpServer({
        rea: {
          ...REA_MCP_SERVER,
          env: {
            REA_MCP_INPUT_SCHEMA_PROFILE: "**********",
            REA_MCP_OUTPUT_SCHEMA_PROFILE: "**********",
          },
        },
      }),
    ).toBe(true);
    expect(hasReaMcpServer({})).toBe(false);
    expect(hasReaMcpServer(undefined)).toBe(false);
    expect(
      hasReaMcpServer({
        rea: { ...REA_MCP_SERVER, args: ["-y", "rea-agents@1.0.0", "mcp"] },
      }),
    ).toBe(false);
    // Entries from earlier releases are rewritten: no compact env, a
    // seconds-valued timeout, or an older description.
    const { env: _env, ...withoutEnv } = REA_MCP_SERVER;
    expect(hasReaMcpServer({ rea: withoutEnv })).toBe(false);
    expect(hasReaMcpServer({ rea: { ...REA_MCP_SERVER, timeout: 120 } })).toBe(
      false,
    );
    expect(
      hasReaMcpServer({ rea: { ...REA_MCP_SERVER, description: "old" } }),
    ).toBe(false);
    expect(REA_MCP_SERVER.env).toEqual(REA_MCP_ENV);
    expect(REA_MCP_SERVER.timeout).toBeUndefined();
    expect(REA_MCP_SERVER.command).toBe("npx");
  });
});
