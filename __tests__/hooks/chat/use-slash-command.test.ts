import React from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSlashCommand } from "#/hooks/chat/use-slash-command";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

const mockSkills = vi.hoisted(() => ({
  data: undefined as unknown[] | undefined,
  isLoading: false,
}));

const mockConversation = vi.hoisted(() => ({
  data: undefined as { conversation_version?: "V0" | "V1" } | undefined,
}));

vi.mock("#/hooks/query/use-skills", () => ({
  useSkills: () => mockSkills,
}));

const mockLlmProfiles = vi.hoisted(() => ({
  data: undefined as
    | {
        profiles: Array<{
          name: string;
          model: string | null;
          base_url: string | null;
          api_key_set: boolean;
        }>;
        active_profile: string | null;
      }
    | undefined,
  isLoading: false,
}));

vi.mock("#/hooks/query/use-conversation-skills", () => ({
  useConversationSkills: () => mockSkills,
}));

vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => mockLlmProfiles,
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => mockConversation,
}));

const mockConversationPlugins = vi.hoisted(() => ({
  data: [] as Array<{
    source: string;
    ref?: string | null;
    repo_path?: string | null;
    name?: string | null;
  }>,
}));

const mockInstalledPlugins = vi.hoisted(() => ({
  data: undefined as
    | Array<{
        name: string;
        source: string;
        repo_path?: string | null;
        skills?: Array<{ name: string; description?: string | null }> | null;
      }>
    | undefined,
  isLoading: false,
}));

vi.mock("#/hooks/use-conversation-plugins", () => ({
  useConversationPlugins: () => mockConversationPlugins.data,
}));

vi.mock("#/hooks/query/use-plugins", () => ({
  usePlugins: () => mockInstalledPlugins,
}));

function makeSkill(
  name: string,
  triggers: string[] = [],
  type: "agentskills" | "knowledge" = "agentskills",
) {
  return { name, type, content: `Description of ${name}`, triggers };
}

function makeChatInputRef() {
  return { current: document.createElement("div") };
}

function setInputText(element: HTMLDivElement, text: string) {
  element.textContent = text;
  element.innerText = text;
  document.body.appendChild(element);

  const textNode = element.firstChild;
  if (!textNode) return;

  const range = document.createRange();
  const selection = window.getSelection();
  range.setStart(textNode, text.length);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

describe("useSlashCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkills.data = undefined;
    mockSkills.isLoading = false;
    mockLlmProfiles.data = undefined;
    mockLlmProfiles.isLoading = false;
    mockConversation.data = undefined;
    mockConversationPlugins.data = [];
    mockInstalledPlugins.data = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear?.();
    __resetActiveStoreForTests();
  });

  it("excludes /new from the built-in commands on a local backend", () => {
    // Arrange — default active backend is the bundled local one.
    mockConversation.data = { conversation_version: "V1" };
    mockSkills.data = [makeSkill("code-search", ["/code-search"])];

    // Act
    const ref = makeChatInputRef();
    const { result } = renderHook(() => useSlashCommand(ref));

    // Assert
    const commands = result.current.filteredItems.map((i) => i.command);
    expect(commands).not.toContain("/new");
    expect(commands).toEqual(expect.arrayContaining(["/btw", "/code-search"]));
  });

  it("lists the bundled skills of the conversation's plugins as slash commands", () => {
    // Arrange — a plugin attached to the conversation (coordinates only, as
    // the /launch flow stores it) whose installed record bundles one skill.
    mockSkills.data = [makeSkill("code-search", ["/code-search"])];
    mockConversationPlugins.data = [
      { source: "/home/me/plugins/city-weather", ref: null, repo_path: null },
    ];
    mockInstalledPlugins.data = [
      {
        name: "city-weather",
        source: "/home/me/plugins/city-weather",
        repo_path: null,
        skills: [
          {
            name: "city-weather:now",
            description: "Current weather for a city",
          },
        ],
      },
      {
        name: "not-loaded",
        source: "github:acme/not-loaded",
        skills: [{ name: "not-loaded:run" }],
      },
    ];

    // Act
    const ref = makeChatInputRef();
    setInputText(ref.current, "/city");
    const { result } = renderHook(() => useSlashCommand(ref));
    act(() => result.current.updateSlashMenu());

    // Assert — the plugin command is listed and filters on its name, while a
    // plugin that is installed but not loaded into this conversation is not.
    expect(result.current.isMenuOpen).toBe(true);
    const commands = result.current.filteredItems.map((i) => i.command);
    expect(commands).toEqual(["/city-weather:now"]);
    expect(result.current.filteredItems[0].skill).toMatchObject({
      name: "city-weather:now",
      description: "Current weather for a city",
    });
  });

  it("does not duplicate a plugin command already provided by the skills catalog", () => {
    mockSkills.data = [makeSkill("city-weather:now")];
    mockConversationPlugins.data = [{ source: "local", name: "city-weather" }];
    mockInstalledPlugins.data = [
      {
        name: "city-weather",
        source: "/somewhere/else",
        skills: [{ name: "city-weather:now" }],
      },
    ];

    const ref = makeChatInputRef();
    const { result } = renderHook(() => useSlashCommand(ref));

    const commands = result.current.filteredItems.filter(
      (i) => i.command === "/city-weather:now",
    );
    expect(commands).toHaveLength(1);
    // The catalog entry wins (matched by name, not coordinates).
    expect(commands[0].skill).toMatchObject({
      content: "Description of city-weather:now",
    });
  });

  it("includes /new in the built-in commands on a cloud backend", () => {
    // Arrange
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    mockConversation.data = { conversation_version: "V1" };
    mockSkills.data = [];

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ActiveBackendProvider, null, children);

    // Act
    const ref = makeChatInputRef();
    const { result } = renderHook(() => useSlashCommand(ref), { wrapper });

    // Assert
    const commands = result.current.filteredItems.map((i) => i.command);
    expect(commands).toContain("/new");
  });

  it("suggests saved LLM profiles after /model on a local backend", () => {
    // The active backend store is reset before each test, which restores the default local backend.

    mockSkills.data = [];
    mockLlmProfiles.data = {
      profiles: [
        {
          name: "haiku",
          model: "anthropic/claude-haiku-4-5",
          base_url: null,
          api_key_set: true,
        },
        {
          name: "gpt",
          model: "openai/gpt-5.1",
          base_url: null,
          api_key_set: true,
        },
        {
          name: "free",
          model: "openhands/glm-5.2",
          base_url: null,
          api_key_set: true,
        },
      ],
      active_profile: "haiku",
    };

    const ref = makeChatInputRef();
    setInputText(ref.current, "/model");

    const { result } = renderHook(() => useSlashCommand(ref));

    act(() => result.current.updateSlashMenu());

    expect(result.current.isMenuOpen).toBe(true);
    expect(result.current.filteredItems.map((i) => i.command)).toEqual([
      "/model haiku",
      "/model gpt",
      "/model free",
    ]);
    expect(
      result.current.filteredItems.find((i) => i.command === "/model free")
        ?.skill.content,
    ).toBe("Switch to OpenHands GLM-5.2 (free)");
  });

  it("filters saved LLM profile suggestions by profile name or model", () => {
    mockSkills.data = [];
    mockLlmProfiles.data = {
      profiles: [
        {
          name: "haiku",
          model: "anthropic/claude-haiku-4-5",
          base_url: null,
          api_key_set: true,
        },
        {
          name: "gpt",
          model: "openai/gpt-5.1",
          base_url: null,
          api_key_set: true,
        },
      ],
      active_profile: null,
    };

    const ref = makeChatInputRef();
    setInputText(ref.current, "/model claude");

    const { result } = renderHook(() => useSlashCommand(ref));

    act(() => result.current.updateSlashMenu());

    expect(result.current.filteredItems.map((i) => i.command)).toEqual([
      "/model haiku",
    ]);
  });
});
