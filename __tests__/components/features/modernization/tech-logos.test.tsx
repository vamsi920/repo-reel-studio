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
import {
  hasReaMcpServer,
  REA_MCP_SERVER,
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
  it("detects the pinned stdio server and nothing else", () => {
    expect(hasReaMcpServer({ rea: REA_MCP_SERVER })).toBe(true);
    expect(hasReaMcpServer({})).toBe(false);
    expect(hasReaMcpServer(undefined)).toBe(false);
    expect(
      hasReaMcpServer({
        rea: { ...REA_MCP_SERVER, args: ["-y", "rea-agents@1.0.0", "mcp"] },
      }),
    ).toBe(false);
    expect(REA_MCP_SERVER.command).toBe("npx");
  });
});
