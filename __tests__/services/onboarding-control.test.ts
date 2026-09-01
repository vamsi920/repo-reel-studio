import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleOnboardingControlAction } from "#/services/onboarding-control";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
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
const context = {
  postResult: (message: string) => posted.push(message),
};

beforeEach(() => {
  posted = [];
  useOnboardingCopilotStore.setState({
    open: false,
    seedPrompt: null,
    pendingCredentialRequest: null,
  });
  useOnboardingStudioStore.getState().reset();
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
  it("has no parameter that invites a credential value", () => {
    const properties = (
      ONBOARDING_CONTROL_CLIENT_TOOL.parameters as {
        properties: Record<string, { type: string }>;
      }
    ).properties;

    const suspicious = Object.keys(properties).filter((name) =>
      /secret|token|password|credential|api_?key/i.test(name),
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
  it("focuses a workbench view without moving the browser", async () => {
    // The original implementation called navigate() here, which threw the
    // user out of the conversation mid-sentence. `navigate` now only changes
    // which panel is in focus.
    await handleOnboardingControlAction(
      action({ command: "navigate", payload: { view: "network" } }),
      context,
    );
    expect(useOnboardingStudioStore.getState().view).toBe("network");
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.status).toBe("focused");
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
        payload: { patch: { mode: "air-gapped" } },
        rationale: "no outbound access",
      }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.status).toBe("awaiting_user");
    expect(payload.patch_keys).toEqual(["mode"]);
  });
});

describe("the interview loop", () => {
  it("records facts and defaults an unlabelled one to inferred", async () => {
    // An inferred fact played back as something the user said is how the agent
    // starts confidently telling people things they never told it, so the
    // unsafe direction has to be the one that requires an explicit claim.
    await handleOnboardingControlAction(
      action({
        command: "record_discovery",
        payload: {
          facts: [
            {
              key: "lang",
              section: "stack",
              text: "Mostly Go",
              confidence: "stated",
            },
            { key: "mono", section: "stack", text: "Probably a monorepo" },
          ],
        },
      }),
      context,
    );

    const facts = useOnboardingStudioStore.getState().facts;
    expect(facts).toHaveLength(2);
    expect(facts.find((fact) => fact.key === "lang")?.confidence).toBe(
      "stated",
    );
    expect(facts.find((fact) => fact.key === "mono")?.confidence).toBe(
      "inferred",
    );
  });

  it("corrects a fact in place instead of contradicting itself", async () => {
    const record = (text: string) =>
      handleOnboardingControlAction(
        action({
          command: "record_discovery",
          payload: { facts: [{ key: "vcs", section: "stack", text }] },
        }),
        context,
      );

    await record("They use GitLab");
    await record("Actually GitHub Enterprise");

    const facts = useOnboardingStudioStore.getState().facts;
    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe("Actually GitHub Enterprise");
  });

  it("refuses to store a pasted credential", async () => {
    // The interview is exactly where someone answers "how do builds
    // authenticate?" by pasting the token.
    await handleOnboardingControlAction(
      action({
        command: "record_discovery",
        payload: {
          facts: [
            {
              key: "ci-auth",
              section: "delivery",
              text: "CI uses ghp_abcdefghijklmnopqrstuvwxyz012345",
            },
          ],
        },
      }),
      context,
    );

    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.status).toBe("rejected");
    expect(payload.reason).toBe("looks_like_credential");
    expect(useOnboardingStudioStore.getState().facts).toEqual([]);
  });

  it("rejects a fact in an unknown section rather than inventing one", async () => {
    await handleOnboardingControlAction(
      action({
        command: "record_discovery",
        payload: {
          facts: [
            { key: "x", section: "astrology", text: "Mercury retrograde" },
          ],
        },
      }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.reason).toBe("no_valid_facts");
  });

  it("tells the agent what exists instead of freezing it into the schema", async () => {
    await handleOnboardingControlAction(
      action({ command: "describe" }),
      context,
    );
    const payload = JSON.parse(posted[0].replace(ONBOARDING_RESULT_PREFIX, ""));
    expect(payload.providers.length).toBeGreaterThan(30);
    expect(payload.providers[0]).toHaveProperty("secret_fields");
    expect(payload.commands).toContain("record_discovery");
  });

  it("plans, then advances to the next outstanding step", async () => {
    await handleOnboardingControlAction(
      action({
        command: "set_setup_plan",
        payload: {
          steps: [
            { id: "a", title: "Connect source control" },
            { id: "b", title: "Connect an issue tracker" },
          ],
        },
      }),
      context,
    );
    expect(useOnboardingStudioStore.getState().currentStepId).toBe("a");

    await handleOnboardingControlAction(
      action({
        command: "advance_plan",
        payload: { stepId: "a", status: "done" },
      }),
      context,
    );
    expect(useOnboardingStudioStore.getState().currentStepId).toBe("b");
  });
});

describe("the workbench, not the browser", () => {
  it("shows a provider picker as a card and stays put", async () => {
    await handleOnboardingControlAction(
      action({ command: "show_provider_picker", capability: "vector-store" }),
      context,
    );
    const cards = useOnboardingStudioStore.getState().cards;
    expect(cards.some((card) => card.kind === "picker")).toBe(true);
  });

  it("replaces a retried connection form rather than stacking dead ones", async () => {
    const open = () =>
      handleOnboardingControlAction(
        action({
          command: "open_connection_form",
          provider_id: "pinecone",
        }),
        context,
      );
    await open();
    await open();

    const forms = useOnboardingStudioStore
      .getState()
      .cards.filter((card) => card.kind === "form");
    expect(forms).toHaveLength(1);
  });
});
