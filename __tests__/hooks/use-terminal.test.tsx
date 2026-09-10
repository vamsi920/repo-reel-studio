import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { useTerminal } from "#/hooks/use-terminal";
import { Command, useCommandStore } from "#/stores/command-store";
import { renderWithProviders } from "../../test-utils";

// Mock useActiveConversation
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: {
      id: "test-conversation-id",
    },
    isFetched: true,
  }),
}));

// Mock useConversationWebSocket
vi.mock("#/contexts/conversation-websocket-context", () => ({
  useConversationWebSocket: () => null,
}));

function TestTerminalComponent() {
  const ref = useTerminal();
  return <div ref={ref} />;
}

describe("useTerminal", () => {
  // Terminal is read-only - no longer tests user input functionality
  const mockTerminal = vi.hoisted(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
    element: document.createElement("div"),
  }));

  const mockFitAddon = vi.hoisted(() => ({
    fit: vi.fn(),
  }));

  beforeAll(() => {
    // mock ResizeObserver - use class for Vitest 4 constructor support
    window.ResizeObserver = class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;

    // mock Terminal - use class for Vitest 4 constructor support
    vi.mock("@xterm/xterm", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@xterm/xterm")>()),
      Terminal: class {
        loadAddon = mockTerminal.loadAddon;

        open = mockTerminal.open;

        write = mockTerminal.write;

        writeln = mockTerminal.writeln;

        reset = mockTerminal.reset;

        dispose = mockTerminal.dispose;

        element = mockTerminal.element;
      },
    }));

    // mock FitAddon
    vi.mock("@xterm/addon-fit", () => ({
      FitAddon: class {
        fit = mockFitAddon.fit;
      },
    }));
  });

  afterEach(() => {
    // Unmount before touching the store: the global cleanup hook runs after
    // this one, and a still-mounted terminal would react to the store reset
    // and leak calls into the next test's mock counts.
    cleanup();
    vi.clearAllMocks();
    // Reset command store between tests
    useCommandStore.setState({ commands: [] });
  });

  it("should render", () => {
    renderWithProviders(<TestTerminalComponent />);
  });

  it("should render the commands in the terminal", () => {
    const commands: Command[] = [
      { content: "echo hello", type: "input" },
      { content: "hello", type: "output" },
    ];

    // Set commands in store before rendering to ensure they're picked up during initialization
    useCommandStore.setState({ commands });

    renderWithProviders(<TestTerminalComponent />);

    expect(mockTerminal.writeln).toHaveBeenNthCalledWith(1, "echo hello");
    expect(mockTerminal.writeln).toHaveBeenNthCalledWith(2, "hello");
  });

  it("wipes the buffer and re-renders from the start when the store is cleared", () => {
    useCommandStore.setState({
      commands: [
        { content: "echo old", type: "input" },
        { content: "old", type: "output" },
      ],
    });

    renderWithProviders(<TestTerminalComponent />);
    expect(mockTerminal.writeln).toHaveBeenCalledTimes(2);
    expect(mockTerminal.reset).not.toHaveBeenCalled();

    // Conversation switch: the route clears the store while the terminal is
    // still mounted, then the new conversation's history is seeded.
    act(() => {
      useCommandStore.getState().clearTerminal();
    });
    expect(mockTerminal.reset).toHaveBeenCalledTimes(1);
    // reset() restores the default modes, so the cursor is hidden again.
    expect(mockTerminal.write).toHaveBeenLastCalledWith("\x1b[?25l");

    act(() => {
      useCommandStore.getState().appendInput("echo new");
    });

    // Before the fix the index still pointed past the old two commands, so
    // the first entries of the new conversation were silently dropped.
    expect(mockTerminal.writeln).toHaveBeenCalledTimes(3);
    expect(mockTerminal.writeln).toHaveBeenLastCalledWith("echo new");
  });

  it("does not reset the buffer while commands only grow", () => {
    useCommandStore.setState({
      commands: [{ content: "echo one", type: "input" }],
    });

    renderWithProviders(<TestTerminalComponent />);

    act(() => {
      useCommandStore.getState().appendOutput("one");
    });

    expect(mockTerminal.reset).not.toHaveBeenCalled();
    expect(mockTerminal.writeln).toHaveBeenCalledTimes(2);
    expect(mockTerminal.writeln).toHaveBeenLastCalledWith("one");
  });

  it("should not call fit() when terminal.element is null", () => {
    // Temporarily set element to null to simulate terminal not being opened
    const originalElement = mockTerminal.element;
    mockTerminal.element = null as unknown as HTMLDivElement;

    renderWithProviders(<TestTerminalComponent />);

    // fit() should not be called because terminal.element is null
    expect(mockFitAddon.fit).not.toHaveBeenCalled();

    // Restore original element
    mockTerminal.element = originalElement;
  });
});
