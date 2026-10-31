import { describe, expect, it } from "vitest";
import { TEST_CONTROL_CLIENT_TOOL } from "#/api/test-control-client-tool";
import { TEST_CONTROL_COMMANDS } from "#/constants/test-control";
import { NEOTEST_SYSTEM_BRIEF } from "#/components/features/testing/brief";
import { COMMAND_SHAPES } from "#/services/test-control";

/**
 * The agent-server caches a client tool's schema per tool NAME for its
 * process lifetime and rejects re-registration with a different one. Editing
 * this schema breaks conversation creation on every running agent-server
 * until it restarts. Volatile detail belongs in `describe`, not here.
 */
describe("test_control schema freeze", () => {
  it("keeps the parameter set stable", () => {
    const parameters = TEST_CONTROL_CLIENT_TOOL.parameters as {
      properties: Record<string, { enum?: string[] }>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(TEST_CONTROL_CLIENT_TOOL.name).toBe("test_control");
    expect(Object.keys(parameters.properties).sort()).toEqual([
      "command",
      "payload",
      "rationale",
    ]);
    expect(parameters.required).toEqual(["command"]);
    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.properties.command.enum).toEqual([
      ...TEST_CONTROL_COMMANDS,
    ]);
  });

  it("documents every command's payload shape and the brief names each command", () => {
    expect(Object.keys(COMMAND_SHAPES).sort()).toEqual(
      [...TEST_CONTROL_COMMANDS].sort(),
    );
    for (const command of TEST_CONTROL_COMMANDS) {
      expect(NEOTEST_SYSTEM_BRIEF).toContain(command);
    }
    expect(NEOTEST_SYSTEM_BRIEF).toContain("[neotest result]");
    expect(NEOTEST_SYSTEM_BRIEF).toContain("never report test numbers");
  });
});
