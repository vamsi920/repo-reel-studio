import { describe, expect, it } from "vitest";
import {
  DELIVERY_CONTRACT_MARKER,
  latestRunError,
  latestRunReport,
  parseRunOutcome,
  withDeliveryContract,
  withoutDeliveryContract,
} from "#/lib/automation/delivery-contract";

describe("withDeliveryContract", () => {
  it("appends the contract once and strips back to the user's prompt", () => {
    const once = withDeliveryContract("Fix issue #1");

    expect(withDeliveryContract(once)).toBe(once);
    expect(once.split(DELIVERY_CONTRACT_MARKER)).toHaveLength(2);
    expect(withoutDeliveryContract(once)).toBe("Fix issue #1");
  });

  it("upgrades a prompt saved with an older contract version", () => {
    const saved =
      "Fix failing CI\n\n<!-- neodevex:delivery-contract v1 -->\n## old rules";

    const upgraded = withDeliveryContract(saved);

    expect(upgraded).not.toContain("v1 -->");
    expect(withoutDeliveryContract(upgraded)).toBe("Fix failing CI");
    // A run about an existing PR must push to it, not open a stacked PR.
    expect(upgraded).toContain("No second PR.");
  });
});

describe("latestRunReport", () => {
  const agentSays = (text: string) => ({
    kind: "MessageEvent",
    source: "agent",
    llm_message: { content: [{ type: "text", text }] },
  });
  const error = { kind: "ConversationErrorEvent" };
  const stateUpdate = { kind: "ConversationStateUpdateEvent" };

  it.each([
    // Resumed after a quota error, then finished: the newest message wins.
    [
      [stateUpdate, agentSays("RESULT: https://x/commit/1"), error],
      "RESULT: https://x/commit/1",
    ],
    // Ended in an error after its last message: no report.
    [[error, agentSays("Working on it")], null],
    [[stateUpdate], null],
  ])("reads %j", (events, expected) => {
    expect(latestRunReport(events)).toBe(expected);
  });
});

describe("parseRunOutcome", () => {
  it.each([
    [
      "Done.\nRESULT: https://github.com/o/r/pull/7",
      { kind: "delivered", url: "https://github.com/o/r/pull/7" },
    ],
    [
      "RESULT: FAILED repository not found",
      { kind: "failed", reason: "repository not found" },
    ],
    // GitHub's "create a PR" page is what a run printed when it never opened one.
    [
      "Opened it: RESULT: https://github.com/o/r/pull/new/my-branch",
      { kind: "unreported" },
    ],
    ["I opened a pull request.", { kind: "unreported" }],
    [null, { kind: "unreported" }],
  ])("reads %j", (message, expected) => {
    expect(parseRunOutcome(message)).toEqual(expected);
  });
});

describe("latestRunError", () => {
  // The exact detail a run with no model API key ended with (round 4).
  const AUTH_ERROR =
    'litellm.AuthenticationError: AuthenticationError: OpenAIException - {\n  "error": {\n    "message": "Incorrect API key provided: None.",\n    "code": "invalid_api_key"\n  }\n}';

  it.each([
    [
      "the cause of a run that ended in error",
      [{ kind: "ConversationErrorEvent", detail: AUTH_ERROR }],
      {
        summary: "AuthenticationError: Incorrect API key provided: None.",
        kind: "llm_auth",
      },
    ],
    [
      "nothing when a later message closed the conversation",
      [
        { kind: "MessageEvent" },
        { kind: "ConversationErrorEvent", detail: AUTH_ERROR },
      ],
      null,
    ],
    [
      "a quota error as llm_quota",
      [{ kind: "ConversationErrorEvent", detail: "RateLimitError: 429 quota" }],
      { summary: "RateLimitError: 429 quota", kind: "llm_quota" },
    ],
  ])("reads %s", (_label, events, expected) => {
    expect(latestRunError(events)).toEqual(expected);
  });
});
