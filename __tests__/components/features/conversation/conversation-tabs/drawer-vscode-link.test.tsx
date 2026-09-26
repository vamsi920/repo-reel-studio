import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DrawerVSCodeLink } from "#/components/features/conversation/conversation-tabs/drawer-vscode-link";
import { AgentState } from "#/types/agent-state";

let mockCurAgentState = AgentState.AWAITING_USER_INPUT;
vi.mock("#/hooks/use-agent-state", () => ({
  useAgentState: () => ({ curAgentState: mockCurAgentState }),
}));

let mockData: { url: string | null } | undefined;
let mockIsLoading = false;
let mockRefetch = vi.fn();
vi.mock("#/hooks/query/use-unified-vscode-url", () => ({
  useUnifiedVSCodeUrl: () => ({
    data: mockData,
    isLoading: mockIsLoading,
    refetch: mockRefetch,
  }),
}));

describe("DrawerVSCodeLink", () => {
  beforeEach(() => {
    mockCurAgentState = AgentState.AWAITING_USER_INPUT;
    mockData = { url: "https://vscode.example.com" };
    mockIsLoading = false;
    mockRefetch = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      location: { href: "" },
      close: vi.fn(),
    } as unknown as Window);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the URL immediately when it is already known", async () => {
    const user = userEvent.setup();
    render(<DrawerVSCodeLink />);

    await user.click(screen.getByTestId("drawer-vscode-link"));

    expect(window.open).toHaveBeenCalledWith(
      "https://vscode.example.com",
      "_blank",
      "noopener,noreferrer",
    );
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it("opens a tab synchronously before awaiting refetch, so the browser doesn't treat the redirect as an unsolicited popup", async () => {
    mockData = undefined;
    const pendingTab = { location: { href: "" }, close: vi.fn() };
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(pendingTab as unknown as Window);
    mockRefetch = vi
      .fn()
      .mockResolvedValue({ data: { url: "https://vscode.example.com" } });

    const user = userEvent.setup();
    render(<DrawerVSCodeLink />);

    await user.click(screen.getByTestId("drawer-vscode-link"));

    // The blank tab must be opened before `refetch` resolves (i.e. inside
    // the synchronous part of the click handler), not after.
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank");
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(pendingTab.location.href).toBe("https://vscode.example.com");
  });

  it("closes the pending tab when the URL never resolves", async () => {
    mockData = undefined;
    const pendingTab = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(
      pendingTab as unknown as Window,
    );
    mockRefetch = vi.fn().mockResolvedValue({ data: undefined });

    const user = userEvent.setup();
    render(<DrawerVSCodeLink />);

    await user.click(screen.getByTestId("drawer-vscode-link"));

    expect(pendingTab.close).toHaveBeenCalledTimes(1);
  });
});
