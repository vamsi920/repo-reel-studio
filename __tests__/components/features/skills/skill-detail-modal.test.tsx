import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillDetailModal } from "#/components/features/skills/skill-detail-modal";
import {
  ADD_SKILL_EXAMPLE_COMMAND,
  ADD_SKILL_SKILL_NAME,
} from "#/constants/skills-docs";
import { useConversationStore } from "#/stores/conversation-store";
import type { SkillInfo } from "#/types/settings";

const navigateMock = vi.fn();
const mockCreateConversationMutate = vi.fn();

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentPath: "/skills",
    conversationId: null,
    isNavigating: false,
  }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: mockCreateConversationMutate,
    isPending: false,
  }),
}));

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "deno",
    type: "knowledge",
    source: "/skills/deno/SKILL.md",
    description: "Deno runtime helper",
    triggers: ["deno"],
    version: "1.0.0",
    license: "MIT",
    compatibility: "Requires Deno 1.40+",
    metadata: { author: "OpenHands" },
    allowed_tools: ["bash"],
    is_agentskills_format: true,
    disable_model_invocation: false,
    content: "# Deno\n\nSkill body.",
    ...overrides,
  };
}

describe("SkillDetailModal", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    mockCreateConversationMutate.mockReset();
    localStorage.clear();
  });

  it("renders metadata fields and closes on request", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onToggle = vi.fn();
    const skill = buildSkill();

    render(
      <SkillDetailModal
        skill={skill}
        enabled
        onToggle={onToggle}
        onClose={onClose}
      />,
    );

    const modal = screen.getByTestId("skill-detail-modal");
    expect(
      within(modal).getByTestId(`skill-modal-name-${skill.name}`),
    ).toHaveTextContent(skill.name);
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-version`),
    ).toBeInTheDocument();
    expect(
      within(modal).getByTestId("skill-type-badge-knowledge"),
    ).toHaveTextContent("SETTINGS$SKILLS_TYPE_KNOWLEDGE");
    expect(
      within(modal).getByTestId(
        `skill-modal-pill-${skill.name}-metadata-author`,
      ),
    ).toHaveTextContent("OpenHands");
    expect(
      within(modal).getByTestId(`skill-modal-field-content-${skill.name}`),
    ).toHaveValue(skill.content);

    await user.click(within(modal).getByTestId("skill-detail-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes from the top-right close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <SkillDetailModal
        skill={buildSkill()}
        enabled
        onToggle={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByTestId("skill-detail-modal-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh conversation and seeds it with the add-skill command from the detail modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const setMessageToSend = vi.fn();
    useConversationStore.setState({ setMessageToSend });

    render(
      <SkillDetailModal
        skill={buildSkill({ name: ADD_SKILL_SKILL_NAME })}
        enabled
        onToggle={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(
      screen.getByTestId(`skill-detail-use-skill-${ADD_SKILL_SKILL_NAME}`),
    );

    // onClose must NOT fire yet: closing the modal here would unmount the
    // hook instance (and its pending onSuccess callback) before the
    // conversation has actually been created -- see
    // use-launch-skill-in-chat.ts for why this order matters.
    expect(onClose).not.toHaveBeenCalled();
    expect(mockCreateConversationMutate).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    // A conversationId must exist before use-chat-input-logic.ts will honor
    // messageToSend, so the hook navigates only once the conversation is
    // actually created, not straight to the bare "/conversations" home page.
    const onSuccess = mockCreateConversationMutate.mock.calls[0][1]
      .onSuccess as (conversation: {
      conversation_id: string;
      task_id?: string;
    }) => void;
    onSuccess({ conversation_id: "convo-123" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/conversations/convo-123");
    await waitFor(() => {
      expect(setMessageToSend).toHaveBeenCalledWith(ADD_SKILL_EXAMPLE_COMMAND);
    });
    expect(
      JSON.parse(localStorage.getItem("conversation-state-convo-123")!)
        .draftMessage,
    ).toBe(ADD_SKILL_EXAMPLE_COMMAND);
  });

  it("stores the draft against the task id when the new conversation is still a pending task", async () => {
    const user = userEvent.setup();
    const setMessageToSend = vi.fn();
    useConversationStore.setState({ setMessageToSend });

    render(
      <SkillDetailModal
        skill={buildSkill({ name: ADD_SKILL_SKILL_NAME })}
        enabled
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(
      screen.getByTestId(`skill-detail-use-skill-${ADD_SKILL_SKILL_NAME}`),
    );

    const onSuccess = mockCreateConversationMutate.mock.calls[0][1]
      .onSuccess as (conversation: {
      conversation_id: string;
      task_id?: string;
    }) => void;
    onSuccess({ conversation_id: "task-abc", task_id: "abc" });

    expect(navigateMock).toHaveBeenCalledWith("/conversations/task-abc");
    await waitFor(() => {
      expect(setMessageToSend).toHaveBeenCalledWith(ADD_SKILL_EXAMPLE_COMMAND);
    });
    expect(localStorage.getItem("pending-task-draft-abc")).toBe(
      ADD_SKILL_EXAMPLE_COMMAND,
    );
  });

  it("closes the modal once conversation creation fails, not before", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <SkillDetailModal
        skill={buildSkill({ name: ADD_SKILL_SKILL_NAME })}
        enabled
        onToggle={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(
      screen.getByTestId(`skill-detail-use-skill-${ADD_SKILL_SKILL_NAME}`),
    );

    expect(onClose).not.toHaveBeenCalled();

    const onError = mockCreateConversationMutate.mock.calls[0][1]
      .onError as () => void;
    onError();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Use skill when the skill is turned off", async () => {
    const user = userEvent.setup();
    const setMessageToSend = vi.fn();
    useConversationStore.setState({ setMessageToSend });
    const skill = buildSkill({ name: ADD_SKILL_SKILL_NAME });

    render(
      <SkillDetailModal
        skill={skill}
        enabled={false}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const useSkillButton = screen.getByTestId(
      `skill-detail-use-skill-${skill.name}`,
    );
    expect(useSkillButton).toBeDisabled();

    await user.click(useSkillButton);

    expect(mockCreateConversationMutate).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(setMessageToSend).not.toHaveBeenCalled();
  });
});
