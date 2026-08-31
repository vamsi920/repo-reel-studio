import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleOnboardingControlAction } from "#/services/onboarding-control";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";
import {
  ONBOARDING_CONTROL_COMMANDS,
  ONBOARDING_CONTROL_ACTION_KIND,
  ONBOARDING_RESULT_PREFIX,
} from "#/constants/onboarding-control";
import { ONBOARDING_CONTROL_CLIENT_TOOL } from "#/api/onboarding-control-client-tool";
import type { OnboardingControlAction } from "#/types/agent-server/core";

vi.mock("#/api/environment-service/environment-service.api", () => ({
  EnvironmentService: {
    probe: vi.fn(async () => ({
      ok: true,
      vantage: "edge" as const,
      latencyMs: 12,
      checks: [
        { id: "reachable", ok: true, labelKey: "PROBE$CHECK_REACHABLE" },
      ],
      probedAt: "2026-08-30T00:00:00.000Z",
    })),
    handoffPacket: vi.fn(async () => ({
      markdown: "# packet",
      allowlistCsv: "",
    })),
  },
  EnvironmentServiceError: class extends Error {},
}));

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({ default: { sendMessage: vi.fn(async () => undefined) } }),
);

function action(
  overrides: Partial<OnboardingControlAction>,
): OnboardingControlAction {
  return {
    kind: ONBOARDING_CONTROL_ACTION_KIND,
    command: "navigate",
    ...overrides,
  } as OnboardingControlAction;
}

let posted: string[];
let navigated: string[];
const context = {
  postResult: (message: string) => posted.push(message),
  navigate: (path: string) => navigated.push(path),
};

beforeEach(() => {
  posted = [];
  navigated = [];
  useOnboardingCopilotStore.setState({
    open: false,
    seedPrompt: null,
    pendingCredentialRequest: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("onboarding_control tool schema", () => {
  /**
   * The security property is a negative one, so it has to be tested as such:
   * no parameter anywhere in this schema may accept a credential value. That
   * is what makes "the agent never sees a secret" structural rather than a
   * convention someone has to keep remembering.
   */
  it("has no parameter that could carry a credential value", () => {
    const properties = (
      ONBOARDING_CONTROL_CLIENT_TOOL.parameters as {
        properties: Record<string, { type: string }>;
      }
    ).properties;

    const suspicious = Object.keys(properties).filter((name) =>
      /secret|token|password|credential|api_?key|value/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });

  it("refuses unknown parameters", () => {
    expect(
      (
        ONBOARDING_CONTROL_CLIENT_TOOL.parameters as {
          additionalProperties: boolean;
        }
      ).additionalProperties,
    ).toBe(false);
  });

  it("ships every command at once", () => {
    // The agent-server caches a client tool's schema per name for its process
    // lifetime and rejects re-registration with a different one, so growing
    // this enum later breaks running servers. The test exists to make that a
    // deliberate decision rather than an accident.
    const enumerated = (
      ONBOARDING_CONTROL_CLIENT_TOOL.parameters as {
        properties: { command: { enum: string[] } };
      }
    ).properties.command.enum;
    expect(enumerated).toEqual([...ONBOARDING_CONTROL_COMMANDS]);
  });
});

describe("handleOnboardingControlAction", () => {
  it("navigates without posting noise back to the agent", async () => {
    await handleOnboardingControlAction(
      action({ command: "navigate", view: "network" }),
      context,
    );
    expect(navigated[0]).toContain("/environment/network");
    expect(posted).toEqual([]);
  });

  it("returns corrective guidance for an unknown command", async () => {
    // The agent-server validates parameter names but not enum values, so a
    // bad command arrives intact; the agent can only recover if we say what
    // is valid instead of failing silently.
    await handleOnboardingControlAction(
      action({ command: "definitely_not_a_command" }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.reason).toBe("unknown_command");
    expect(payload.valid_commands).toContain("run_probe");
  });

  it("requests credentials by field name and stores no value", async () => {
    await handleOnboardingControlAction(
      action({
        command: "request_credentials",
        provider_id: "pinecone",
        fields: ["apiKey"],
      }),
      context,
    );

    const pending =
      useOnboardingCopilotStore.getState().pendingCredentialRequest;
    expect(pending?.providerId).toBe("pinecone");
    expect(pending?.fields).toEqual(["apiKey"]);

    // The whole store, serialised, must contain no value-shaped slot -- the
    // request carries names only, and there is nowhere for a value to land.
    const snapshot = JSON.stringify(useOnboardingCopilotStore.getState());
    expect(snapshot).not.toMatch(/"value"|"credentials"|"secret"/i);

    // Nothing is reported yet: the credential sheet posts the receipt once
    // the value has gone browser -> edge function and come back verified.
    expect(posted).toEqual([]);
  });

  it("ignores field names the manifest does not mark secret", async () => {
    await handleOnboardingControlAction(
      action({
        command: "request_credentials",
        provider_id: "pinecone",
        // indexHost is configuration, not a credential; asking for it through
        // the secret path would store it encrypted and unreadable.
        fields: ["indexHost"],
      }),
      context,
    );
    const pending =
      useOnboardingCopilotStore.getState().pendingCredentialRequest;
    expect(pending?.fields).toEqual(["apiKey"]);
  });

  it("rejects an unknown provider rather than opening an empty form", async () => {
    await handleOnboardingControlAction(
      action({ command: "request_credentials", provider_id: "not-a-provider" }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.reason).toBe("unknown_provider");
    expect(
      useOnboardingCopilotStore.getState().pendingCredentialRequest,
    ).toBeNull();
  });

  it("refuses egress targets outside the registry", async () => {
    // Otherwise run_probe is a port scanner the agent can be talked into
    // operating from inside the customer's network.
    await handleOnboardingControlAction(
      action({
        command: "run_probe",
        probe_kind: "egress",
        targets: ["internal-payroll.corp"],
      }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.status).toBe("rejected");
    expect(payload.rejected).toEqual(["internal-payroll.corp"]);
  });

  it("probes a known host and labels the vantage it came from", async () => {
    await handleOnboardingControlAction(
      action({
        command: "run_probe",
        probe_kind: "egress",
        targets: ["api.github.com", "internal-payroll.corp"],
      }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.status).toBe("ok");
    expect(payload.vantage).toBe("edge");
    expect(payload.vantage_note).toMatch(/not the customer/i);
    expect(payload.rejected_targets).toEqual(["internal-payroll.corp"]);
  });

  it("delegates a runtime-vantage probe instead of answering from the wrong network", async () => {
    await handleOnboardingControlAction(
      action({
        command: "run_probe",
        probe_kind: "egress",
        targets: ["api.github.com"],
        vantage: "runtime",
      }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.status).toBe("delegated");
    expect(payload.run).toContain("environment-preflight.mjs");
  });

  it("never applies a profile change itself", async () => {
    await handleOnboardingControlAction(
      action({
        command: "propose_profile_change",
        profile_patch: { mode: "air-gapped" },
        rationale: "no outbound access",
      }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.status).toBe("awaiting_user");
    expect(payload.patch_keys).toEqual(["mode"]);
  });
});
