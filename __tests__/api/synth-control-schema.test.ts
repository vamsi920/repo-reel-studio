import { describe, expect, it } from "vitest";
import { SYNTH_CONTROL_CLIENT_TOOL } from "#/api/synth-control-client-tool";
import { SYNTH_CONTROL_COMMANDS } from "#/constants/synth-control";
import { SYNTH_SYSTEM_BRIEF } from "#/components/features/synth/brief";
import { COMMAND_SHAPES } from "#/services/synth-control";

/**
 * The agent-server caches a client tool's schema per tool NAME for its
 * process lifetime and rejects re-registration with a different one. Editing
 * this schema breaks conversation creation on every running agent-server
 * until it restarts. Volatile detail belongs in `describe`, not here.
 */
describe("synth_control schema freeze", () => {
  it("keeps the parameter set stable", () => {
    const parameters = SYNTH_CONTROL_CLIENT_TOOL.parameters as {
      properties: Record<string, { enum?: string[] }>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(SYNTH_CONTROL_CLIENT_TOOL.name).toBe("synth_control");
    expect(Object.keys(parameters.properties).sort()).toEqual([
      "command",
      "payload",
      "rationale",
    ]);
    expect(parameters.required).toEqual(["command"]);
    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.properties.command.enum).toEqual([
      ...SYNTH_CONTROL_COMMANDS,
    ]);
  });

  it("documents every command's payload shape and the brief names each command", () => {
    expect(Object.keys(COMMAND_SHAPES).sort()).toEqual(
      [...SYNTH_CONTROL_COMMANDS].sort(),
    );
    for (const command of SYNTH_CONTROL_COMMANDS) {
      expect(SYNTH_SYSTEM_BRIEF).toContain(command);
    }
    expect(SYNTH_SYSTEM_BRIEF).toContain("[synth result]");
    expect(SYNTH_SYSTEM_BRIEF).toContain("NEVER record real data");
  });
});
