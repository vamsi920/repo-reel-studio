import { describe, expect, it } from "vitest";
import { ONBOARDING_CONTROL_CLIENT_TOOL } from "#/api/onboarding-control-client-tool";
import { ONBOARDING_CONTROL_COMMANDS } from "#/constants/onboarding-control";

/**
 * The agent-server caches a client tool's schema per tool NAME for its process
 * lifetime and rejects re-registration with a different one
 * (`ClientToolSchemaConflictError`). Editing this schema therefore breaks
 * conversation creation on every running agent-server until it restarts.
 *
 * These tests exist so that is a deliberate decision with a failing test in
 * front of it, rather than something discovered in production. If you are here
 * because a test failed: either revert, or rename the tool to
 * `onboarding_control_v2` (the cache is keyed by name) and update the snapshot.
 */
describe("onboarding_control schema freeze", () => {
  it("keeps the parameter set stable", () => {
    const parameters = ONBOARDING_CONTROL_CLIENT_TOOL.parameters as {
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };

    expect(Object.keys(parameters.properties).sort()).toEqual([
      "capability",
      "command",
      "fields",
      "instance_key",
      "note",
      "payload",
      "probe_kind",
      "provider_id",
      "rationale",
      "targets",
      "vantage",
    ]);
    expect(parameters.required).toEqual(["command"]);
    expect(parameters.additionalProperties).toBe(false);
  });

  it("keeps volatile catalogues out of the schema", () => {
    // Providers, views and discovery sections all grow over time. Any of them
    // baked in as an enum would force an agent-server restart every time a
    // connector is added, which is why `describe` answers them at runtime.
    const serialised = JSON.stringify(
      ONBOARDING_CONTROL_CLIENT_TOOL.parameters,
    );
    expect(serialised).not.toContain("pinecone");
    expect(serialised).not.toContain("github-enterprise");
  });

  it("ships every command at once", () => {
    const enumerated = (
      ONBOARDING_CONTROL_CLIENT_TOOL.parameters as {
        properties: { command: { enum: string[] } };
      }
    ).properties.command.enum;
    expect(enumerated).toEqual([...ONBOARDING_CONTROL_COMMANDS]);
  });

  it("tells the agent it is not driving navigation", () => {
    // The behavioural fix has to be reflected in the prompt too, or the model
    // keeps trying to move the user around.
    expect(ONBOARDING_CONTROL_CLIENT_TOOL.description).toMatch(
      /not driving navigation|renders into the panel/i,
    );
  });
});
