import { beforeEach, describe, expect, it, vi } from "vitest";

const { switchProfile, resumeConversation, recordRouting } = vi.hoisted(() => ({
  switchProfile: vi.fn(async (..._args: unknown[]) => {}),
  resumeConversation: vi.fn(async (..._args: unknown[]) => true),
  recordRouting: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({ default: { switchProfile, resumeConversation } }),
);
vi.mock("#/api/agentops-service/agentops-service.api", () => ({
  default: { recordRouting },
  isAgentOpsSupportedBackend: () => true,
}));
vi.mock("#/lib/model-routing/classifier-transport", () => ({
  getRoutingClassifier: () => null,
}));

import {
  getStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import {
  handleLlmErrorForRouting,
  prepareChatTurn,
} from "#/lib/model-routing/runtime";
import { useModelStore } from "#/stores/model-store";
import {
  DEFAULT_ROUTING_PREFERENCES,
  useModelRoutingStore,
} from "#/stores/model-routing-store";

const CONV = "conv-1";
const HARD =
  "Refactor the auth architecture across the entire codebase and debug the race condition in src/auth/session.ts";

const seed = (mode: "auto" | "manual") => {
  useModelRoutingStore.setState({
    backendId: "b",
    prefs: { ...DEFAULT_ROUTING_PREFERENCES, mode },
    profiles: [
      {
        name: "pro",
        model: "gemini/gemini-2.5-pro",
        base_url: null,
        api_key_set: true,
      },
      {
        name: "flash",
        model: "gemini/gemini-2.5-flash",
        base_url: null,
        api_key_set: true,
      },
    ],
    health: {},
    sticky: {},
    decisions: [],
    lastDecisionByConversation: {},
    currentProfileByConversation: { [CONV]: "flash" },
    fallbackByConversation: {},
    modeByConversation: {},
  });
  useModelStore.getState().clearAll();
};

beforeEach(() => {
  localStorage.clear();
  switchProfile.mockClear();
  switchProfile.mockImplementation(async () => {});
  resumeConversation.mockClear();
  recordRouting.mockClear();
});

// @spec MR-014 — Route before send
describe("prepareChatTurn", () => {
  it("switches to the routed profile before the turn is sent", async () => {
    seed("auto");

    const turn = await prepareChatTurn({
      conversationId: CONV,
      text: HARD,
      hasImages: false,
      isBusy: false,
      isAcp: false,
    });

    expect(switchProfile).toHaveBeenCalledWith(CONV, "pro");
    expect(turn?.decision).toMatchObject({
      profileName: "pro",
      switched: true,
    });
    expect(getStoredConversationMetadata(CONV)?.active_profile).toBe("pro");
    expect(recordRouting).toHaveBeenCalledWith(
      CONV,
      expect.objectContaining({ action: "model.routed", profile: "pro" }),
    );
  });

  it("does nothing in manual mode, for ACP, or while the agent runs", async () => {
    seed("manual");
    await prepareChatTurn({
      conversationId: CONV,
      text: HARD,
      hasImages: false,
      isBusy: false,
      isAcp: false,
    });
    seed("auto");
    await prepareChatTurn({
      conversationId: CONV,
      text: HARD,
      hasImages: false,
      isBusy: true,
      isAcp: false,
    });
    await prepareChatTurn({
      conversationId: CONV,
      text: HARD,
      hasImages: false,
      isBusy: false,
      isAcp: true,
    });
    expect(switchProfile).not.toHaveBeenCalled();
  });

  it("still lets the turn go out when the switch fails", async () => {
    seed("auto");
    switchProfile.mockRejectedValueOnce(new Error("boom"));

    const turn = await prepareChatTurn({
      conversationId: CONV,
      text: HARD,
      hasImages: false,
      isBusy: false,
      isAcp: false,
    });

    expect(turn?.decision).toMatchObject({
      profileName: "flash",
      switched: false,
    });
  });

  it("honours a per-chat override over the global default", async () => {
    seed("auto");
    setStoredConversationMetadata(CONV, {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      routing_mode: "manual",
    });
    await prepareChatTurn({
      conversationId: CONV,
      text: HARD,
      hasImages: false,
      isBusy: false,
      isAcp: false,
    });
    expect(switchProfile).not.toHaveBeenCalled();
  });
});

// @spec MR-008 — LLM error classification and fallback
describe("handleLlmErrorForRouting", () => {
  it("fails over to a healthy profile and resumes the run in Auto", async () => {
    seed("auto");
    useModelRoutingStore.getState().setCurrentProfile(CONV, "pro");

    const outcome = await handleLlmErrorForRouting({
      conversationId: CONV,
      code: "LLMRateLimitError",
      detail: "429",
    });

    expect(outcome).toMatchObject({ kind: "rate_limit", recovered: true });
    expect(switchProfile).toHaveBeenCalledWith(CONV, "flash");
    expect(resumeConversation).toHaveBeenCalledWith(CONV);
    expect(useModelRoutingStore.getState().health.pro.state).toBe("open");
  });

  it("only records health in manual mode", async () => {
    seed("manual");
    useModelRoutingStore.getState().setCurrentProfile(CONV, "pro");

    const outcome = await handleLlmErrorForRouting({
      conversationId: CONV,
      code: "LLMRateLimitError",
      detail: "",
    });

    expect(outcome?.recovered).toBe(false);
    expect(switchProfile).not.toHaveBeenCalled();
    expect(useModelRoutingStore.getState().health.pro.state).toBe("open");
  });

  it("stops after the per-turn hop limit", async () => {
    seed("auto");
    useModelRoutingStore.getState().setCurrentProfile(CONV, "pro");
    useModelRoutingStore.setState({
      fallbackByConversation: { [CONV]: { hops: 2, tried: ["pro", "flash"] } },
    });

    const outcome = await handleLlmErrorForRouting({
      conversationId: CONV,
      code: "LLMServiceUnavailableError",
      detail: "",
    });

    expect(outcome?.recovered).toBe(false);
    expect(switchProfile).not.toHaveBeenCalled();
  });
});
