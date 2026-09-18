import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemMessageModal } from "#/components/features/conversation-panel/system-message-modal";
import { SystemMessageForModal } from "#/utils/system-message-adapter";

const systemMessageWithTools: SystemMessageForModal = {
  content: "system prompt for conversation A",
  tools: [
    {
      type: "function",
      function: {
        name: "bash",
        description: "Execute bash",
        parameters: {},
      },
    },
  ],
  openhands_version: null,
  agent_class: null,
};

const systemMessageWithoutTools: SystemMessageForModal = {
  content: "system prompt for conversation B",
  tools: null,
  openhands_version: null,
  agent_class: null,
};

describe("SystemMessageModal", () => {
  it("renders nothing when there is no system message", () => {
    const { container } = render(
      <SystemMessageModal onClose={() => {}} systemMessage={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // Regression test: every call site (conversation-name.tsx,
  // chat-add-file-button.tsx, controls/tools.tsx) must only mount this
  // component while it's actually open (`{visible && <SystemMessageModal .../>}`)
  // rather than keeping a single instance mounted behind an `isOpen` prop.
  // The modal's tab/expanded-tool state is local `useState`, so an
  // always-mounted instance would carry the previously viewed conversation's
  // selected tab and expanded tools into the next conversation opened.
  it("starts on the System Message tab with nothing expanded on every fresh mount", async () => {
    const user = userEvent.setup();

    const first = render(
      <SystemMessageModal
        onClose={() => {}}
        systemMessage={systemMessageWithTools}
      />,
    );

    const toolsTab = screen.getByRole("tab", {
      name: "SYSTEM_MESSAGE_MODAL$TOOLS_TAB",
    });
    await user.click(toolsTab);
    expect(toolsTab).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "bash" }));
    expect(screen.getByText("Execute bash")).toBeInTheDocument();

    // Simulate closing the modal (caller unmounts it) and reopening it for a
    // different conversation, which has no tools at all.
    first.unmount();
    render(
      <SystemMessageModal
        onClose={() => {}}
        systemMessage={systemMessageWithoutTools}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "SYSTEM_MESSAGE_MODAL$SYSTEM_MESSAGE_TAB" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("system prompt for conversation B"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "SYSTEM_MESSAGE_MODAL$TOOLS_TAB" }),
    ).not.toBeInTheDocument();
  });
});
