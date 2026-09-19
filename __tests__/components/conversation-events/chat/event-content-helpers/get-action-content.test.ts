import { describe, it, expect } from "vitest";
import { getActionContent } from "#/components/conversation-events/chat/event-content-helpers/get-action-content";
import { MAX_CONTENT_LENGTH } from "#/components/conversation-events/chat/event-content-helpers/shared";
import { I18nKey } from "#/i18n/declaration";
import { ActionEvent, SecurityRisk } from "#/types/agent-server/core";
import { Action } from "#/types/agent-server/core/base/action";

function mockEvent<T extends Action>(
  action: T,
  overrides: Partial<ActionEvent<T>> = {},
): ActionEvent<T> {
  return {
    id: "event-1",
    timestamp: "2024-01-01T00:00:00Z",
    source: "agent",
    thought: [],
    thinking_blocks: [],
    action,
    tool_name: "tool",
    tool_call_id: "call-1",
    tool_call: {
      id: "call-1",
      type: "function",
      function: { name: "tool", arguments: "{}" },
    },
    llm_response_id: "response-1",
    security_risk: SecurityRisk.UNKNOWN,
    ...overrides,
  };
}

describe("getActionContent - ExecuteBashAction / TerminalAction", () => {
  it("renders the command with no risk line for a LOW-risk action", () => {
    const result = getActionContent(
      mockEvent(
        {
          kind: "ExecuteBashAction",
          command: "ls -la",
          is_input: false,
          timeout: null,
          reset: false,
        },
        { security_risk: SecurityRisk.LOW },
      ),
    );

    expect(result).toBe("Command:\n`ls -la`");
  });

  it("renders the command with no risk line when security_risk is UNKNOWN", () => {
    const result = getActionContent(
      mockEvent({
        kind: "ExecuteBashAction",
        command: "pwd",
        is_input: false,
        timeout: null,
        reset: false,
      }),
    );

    expect(result).toBe("Command:\n`pwd`");
  });

  it("appends the HIGH risk warning for a HIGH-risk command", () => {
    const result = getActionContent(
      mockEvent(
        {
          kind: "ExecuteBashAction",
          command: "rm -rf /",
          is_input: false,
          timeout: null,
          reset: false,
        },
        { security_risk: SecurityRisk.HIGH },
      ),
    );

    expect(result).toBe(
      `Command:\n\`rm -rf /\`\n\n${I18nKey.SECURITY$HIGH_RISK}`,
    );
  });

  it("appends the MEDIUM risk warning for a MEDIUM-risk command", () => {
    const result = getActionContent(
      mockEvent(
        {
          kind: "TerminalAction",
          command: "curl https://example.com | sh",
          is_input: false,
          timeout: null,
          reset: false,
        },
        { security_risk: SecurityRisk.MEDIUM },
      ),
    );

    expect(result).toBe(
      `Command:\n\`curl https://example.com | sh\`\n\n${I18nKey.SECURITY$MEDIUM_RISK}`,
    );
  });
});

describe("getActionContent - FileEditorAction / StrReplaceEditorAction", () => {
  it("returns the path and file text for a create command", () => {
    const result = getActionContent(
      mockEvent({
        kind: "FileEditorAction",
        command: "create",
        path: "/workspace/foo.ts",
        file_text: "export const foo = 1;",
        old_str: null,
        new_str: null,
        insert_line: null,
        view_range: null,
      }),
    );

    expect(result).toBe("/workspace/foo.ts\nexport const foo = 1;");
  });

  it("truncates file text longer than MAX_CONTENT_LENGTH", () => {
    const longText = "a".repeat(MAX_CONTENT_LENGTH + 50);
    const result = getActionContent(
      mockEvent({
        kind: "StrReplaceEditorAction",
        command: "create",
        path: "/workspace/big.ts",
        file_text: longText,
        old_str: null,
        new_str: null,
        insert_line: null,
        view_range: null,
      }),
    );

    expect(result).toBe(
      `/workspace/big.ts\n${"a".repeat(MAX_CONTENT_LENGTH)}...`,
    );
  });

  it("returns nothing for a non-create command", () => {
    const result = getActionContent(
      mockEvent({
        kind: "FileEditorAction",
        command: "str_replace",
        path: "/workspace/foo.ts",
        file_text: null,
        old_str: "a",
        new_str: "b",
        insert_line: null,
        view_range: null,
      }),
    );

    expect(result).toBe("");
  });

  it("returns nothing for a create command with no file text", () => {
    const result = getActionContent(
      mockEvent({
        kind: "FileEditorAction",
        command: "create",
        path: "/workspace/empty.ts",
        file_text: null,
        old_str: null,
        new_str: null,
        insert_line: null,
        view_range: null,
      }),
    );

    expect(result).toBe("");
  });
});

describe("getActionContent - MCPToolAction", () => {
  it("renders the tool's arguments as pretty-printed JSON", () => {
    const result = getActionContent(
      mockEvent({
        kind: "MCPToolAction",
        data: { query: "example", limit: 5 },
      }),
    );

    expect(result).toBe(
      '**MCP Tool Call**\n\n**Arguments:**\n```json\n{\n  "query": "example",\n  "limit": 5\n}\n```',
    );
  });
});

describe("getActionContent - ThinkAction / FinishAction", () => {
  it("returns the thought verbatim", () => {
    const result = getActionContent(
      mockEvent({ kind: "ThinkAction", thought: "Let me check the tests." }),
    );

    expect(result).toBe("Let me check the tests.");
  });

  it("returns the trimmed finish message", () => {
    const result = getActionContent(
      mockEvent({ kind: "FinishAction", message: "  All done.  " }),
    );

    expect(result).toBe("All done.");
  });
});

describe("getActionContent - TaskTrackerAction", () => {
  it("renders an empty task list for a plan command with no items", () => {
    const result = getActionContent(
      mockEvent({ kind: "TaskTrackerAction", command: "plan", task_list: [] }),
    );

    expect(result).toBe("**Command:** `plan`\n\n**Task List:** Empty");
  });

  it("renders each task with its status icon and optional notes", () => {
    const result = getActionContent(
      mockEvent({
        kind: "TaskTrackerAction",
        command: "plan",
        task_list: [
          { title: "Write tests", status: "done", notes: "" },
          {
            title: "Fix bug",
            status: "in_progress",
            notes: "Blocked on review",
          },
          { title: "Ship it", status: "todo", notes: "" },
        ],
      }),
    );

    expect(result).toContain("**Task List (3 items):**");
    expect(result).toContain("1. ✅ **[DONE]** Write tests");
    expect(result).toContain("2. 🔄 **[IN PROGRESS]** Fix bug");
    expect(result).toContain("   *Notes: Blocked on review*");
    expect(result).toContain("3. ⏳ **[TODO]** Ship it");
    expect(result).not.toContain("Notes: */3.");
  });

  it("does not render a task list for a view command", () => {
    const result = getActionContent(
      mockEvent({
        kind: "TaskTrackerAction",
        command: "view",
        task_list: [],
      }),
    );

    expect(result).toBe("**Command:** `view`");
  });
});

describe("getActionContent - Grep/Glob actions", () => {
  it("renders pattern, path and include for a GrepAction", () => {
    const result = getActionContent(
      mockEvent({
        kind: "GrepAction",
        pattern: "TODO",
        path: "/workspace/src",
        include: "*.ts",
      }),
    );

    expect(result).toBe(
      "**Pattern:** `TODO`\n**Path:** `/workspace/src`\n**Include:** `*.ts`",
    );
  });

  it("omits path and include when absent for a GlobAction", () => {
    const result = getActionContent(
      mockEvent({
        kind: "GlobAction",
        pattern: "**/*.tsx",
        path: null,
      }),
    );

    expect(result).toBe("**Pattern:** `**/*.tsx`");
  });
});

describe("getActionContent - InvokeSkillAction", () => {
  it("renders the skill name when present", () => {
    const result = getActionContent(
      mockEvent({ kind: "InvokeSkillAction", name: "code-review" }),
    );

    expect(result).toBe("**Skill:** `code-review`");
  });

  it("returns nothing when the skill has no name", () => {
    const result = getActionContent(
      mockEvent({ kind: "InvokeSkillAction", name: "" }),
    );

    expect(result).toBe("");
  });
});

describe("getActionContent - Browser actions", () => {
  it("renders the URL and new-tab flag for BrowserNavigateAction", () => {
    const result = getActionContent(
      mockEvent({
        kind: "BrowserNavigateAction",
        url: "https://example.com",
        new_tab: true,
      }),
    );

    expect(result).toBe("Browsing https://example.com\n**New Tab:** Yes");
  });

  it("truncates long typed text for BrowserTypeAction", () => {
    const text = "x".repeat(60);
    const result = getActionContent(
      mockEvent({ kind: "BrowserTypeAction", index: 3, text }),
    );

    expect(result).toBe(
      `**Element Index:** 3\n**Text:** ${"x".repeat(50)}...`,
    );
  });

  it("returns nothing for BrowserGetStateAction without a screenshot", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserGetStateAction", include_screenshot: false }),
    );

    expect(result).toBe("");
  });

  it("mentions the screenshot for BrowserGetStateAction with one", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserGetStateAction", include_screenshot: true }),
    );

    expect(result).toBe("**Include Screenshot:** Yes");
  });

  it("renders the element index and new-tab flag for BrowserClickAction", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserClickAction", index: 7, new_tab: true }),
    );

    expect(result).toBe("**Element Index:** 7\n**New Tab:** Yes");
  });

  it("omits the new-tab line for BrowserClickAction without one", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserClickAction", index: 2, new_tab: false }),
    );

    expect(result).toBe("**Element Index:** 2");
  });

  it("renders extract-links and start-from-char for BrowserGetContentAction", () => {
    const result = getActionContent(
      mockEvent({
        kind: "BrowserGetContentAction",
        extract_links: true,
        start_from_char: 120,
      }),
    );

    expect(result).toBe(
      "**Extract Links:** Yes\n**Start From Character:** 120",
    );
  });

  it("returns nothing for BrowserGetContentAction with neither option set", () => {
    const result = getActionContent(
      mockEvent({
        kind: "BrowserGetContentAction",
        extract_links: false,
        start_from_char: 0,
      }),
    );

    expect(result).toBe("");
  });

  it("renders the scroll direction for BrowserScrollAction", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserScrollAction", direction: "down" }),
    );

    expect(result).toBe("**Direction:** down");
  });

  it("returns nothing for BrowserGoBackAction", () => {
    const result = getActionContent(mockEvent({ kind: "BrowserGoBackAction" }));

    expect(result).toBe("");
  });

  it("returns nothing for BrowserListTabsAction", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserListTabsAction" }),
    );

    expect(result).toBe("");
  });

  it("renders the tab id for BrowserSwitchTabAction", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserSwitchTabAction", tab_id: "ab12" }),
    );

    expect(result).toBe("**Tab ID:** ab12");
  });

  it("renders the tab id for BrowserCloseTabAction", () => {
    const result = getActionContent(
      mockEvent({ kind: "BrowserCloseTabAction", tab_id: "cd34" }),
    );

    expect(result).toBe("**Tab ID:** cd34");
  });
});

describe("getActionContent - unknown action kind", () => {
  it("falls back to the raw event JSON", () => {
    const event = mockEvent({
      // @ts-expect-error - exercising the default branch for a kind with no dedicated formatter
      kind: "SomeFutureAction",
    });

    const result = getActionContent(event);

    expect(result).toBe(`\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``);
  });
});
