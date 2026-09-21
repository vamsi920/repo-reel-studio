import { beforeEach, describe, expect, it } from "vitest";
import { useFilesTabStore } from "#/stores/files-tab-store";

describe("useFilesTabStore", () => {
  beforeEach(() => {
    useFilesTabStore.setState({
      selectedPath: null,
      selectedConversationId: null,
    });
  });

  it("starts with no selection", () => {
    const state = useFilesTabStore.getState();
    expect(state.selectedPath).toBeNull();
    expect(state.selectedConversationId).toBeNull();
  });

  it("tags a selected path with the conversation it was made in", () => {
    useFilesTabStore.getState().setSelectedPath("src/index.ts", "convo-1");

    const state = useFilesTabStore.getState();
    expect(state.selectedPath).toBe("src/index.ts");
    expect(state.selectedConversationId).toBe("convo-1");
  });

  it("defaults the conversation id to null when omitted", () => {
    useFilesTabStore.getState().setSelectedPath("README.md");

    const state = useFilesTabStore.getState();
    expect(state.selectedPath).toBe("README.md");
    expect(state.selectedConversationId).toBeNull();
  });

  it("switching conversations replaces both the path and its owning conversation", () => {
    useFilesTabStore.getState().setSelectedPath("a.ts", "convo-1");
    useFilesTabStore.getState().setSelectedPath("b.ts", "convo-2");

    const state = useFilesTabStore.getState();
    expect(state.selectedPath).toBe("b.ts");
    expect(state.selectedConversationId).toBe("convo-2");
  });

  it("clears the selection when set to null", () => {
    useFilesTabStore.getState().setSelectedPath("a.ts", "convo-1");
    useFilesTabStore.getState().setSelectedPath(null, "convo-1");

    const state = useFilesTabStore.getState();
    expect(state.selectedPath).toBeNull();
    expect(state.selectedConversationId).toBe("convo-1");
  });
});
