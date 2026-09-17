import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileContentViewer } from "#/components/features/files-tab/file-content-viewer";
import type { ViewMode } from "#/components/features/files-tab/view-mode";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

// Mock the *services* the file-content hook depends on — not the hook itself —
// so the real classification (text decoded, then flipped to binary on a NUL
// sniff) runs end to end through the viewer.
const useWorkspaceSessionMock = vi.fn();
vi.mock("#/hooks/query/use-workspace-session", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("#/hooks/query/use-workspace-session")
    >();
  return {
    ...real, // keep the real joinWorkspaceUrl the hook builds its fetch URL with
    useWorkspaceSession: () => useWorkspaceSessionMock(),
  };
});

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => useRuntimeIsReadyMock(),
}));

const getActiveBackendMock = vi.fn();
vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => getActiveBackendMock(),
}));

// The hook statically imports the cloud runtime service; stub the module so
// this local-path test never loads the real cloud/proxy machinery. The test
// uses the fetch (local) path, so downloadFile is never called or asserted.
vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: { downloadFile: vi.fn() },
}));

const fetchMock = vi.fn();

const BASE_URL =
  "https://agent.example.com/api/conversations/conv-1/workspace/";

function renderViewer(path: string, viewMode: ViewMode = "rich") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FileContentViewer path={path} viewMode={viewMode} />
    </QueryClientProvider>,
  );
}

describe("FileContentViewer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    useWorkspaceSessionMock.mockReset();
    useActiveConversationMock.mockReset();
    useRuntimeIsReadyMock.mockReset();
    getActiveBackendMock.mockReset();

    useRuntimeIsReadyMock.mockReturnValue(true);
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        conversation_url: "https://agent.example.com/api/conversations/conv-1",
        session_api_key: "session-key",
      },
    });
    useWorkspaceSessionMock.mockReturnValue({
      data: { baseUrl: BASE_URL },
      isLoading: false,
      isError: false,
      error: null,
    });
    getActiveBackendMock.mockReturnValue({
      backend: { id: "local-1", kind: "local", host: "http://localhost:8000" },
      orgId: null,
    });
    useWorkspaceMutationCounter.setState({ count: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the translated load error (never the raw Error message) with the HTTP status and a Retry", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    renderViewer("big.json", "plain");

    const error = await screen.findByTestId("file-content-viewer-error");
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveTextContent("FILES$LOAD_ERROR");
    expect(error).not.toHaveTextContent("Failed to read");
    expect(
      screen.getByTestId("file-content-viewer-error-status"),
    ).toHaveTextContent("FILES$LOAD_ERROR_STATUS");

    // Retry re-fetches; a now-OK response replaces the error state.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode("{}").buffer),
    });
    await userEvent.click(screen.getByTestId("file-content-viewer-retry"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("file-content-viewer-error"),
      ).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // The acceptance criteria require the clear message in BOTH view modes. The
  // plain-mode fallback and the rich-mode binary branch both route through
  // UnpreviewableFallback, so one parametrized spec covers both code paths.
  it.each(["rich", "plain"] as const)(
    "shows a clear unsupported-document message for an Office file (.pptx) in %s mode",
    async (viewMode) => {
      // Arrange: the workspace fileserver returns real .pptx bytes — a ZIP whose
      // header carries a NUL, so the hook classifies the file as binary.
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () =>
          Promise.resolve(
            new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]).buffer,
          ),
      });

      // Act
      renderViewer("demo.pptx", viewMode);

      // Assert: the format-aware "no preview" message replaces the generic
      // binary fallback in both modes, so the pane is never blank.
      expect(
        await screen.findByTestId("file-content-viewer-unsupported-document"),
      ).toBeInTheDocument();
    },
  );

  it("rich mode shows a clear message when an image's bytes fail to decode, instead of a broken <img>", async () => {
    // fake.png is classified as "image" by extension alone, so
    // useWorkspaceFileContent never fetches its bytes — the failure can
    // only be observed via the <img> itself failing to decode.
    renderViewer("fake.png", "rich");

    const img = await screen.findByAltText("fake.png");
    fireEvent.error(img);

    expect(
      await screen.findByTestId("file-content-viewer-invalid-image"),
    ).toHaveTextContent("FILES$INVALID_IMAGE");
    expect(screen.queryByAltText("fake.png")).not.toBeInTheDocument();
  });

  it("plain mode shows the real bytes as text for a file with a misleading image extension", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(
          new TextEncoder().encode("this is plain text, not an image")
            .buffer,
        ),
    });

    renderViewer("fake.png", "plain");

    expect(
      await screen.findByTestId("file-content-viewer-plain"),
    ).toHaveTextContent("this is plain text, not an image");
    expect(
      screen.queryByTestId("file-content-viewer-binary-fallback"),
    ).not.toBeInTheDocument();
  });

  it("plain mode keeps the binary fallback for a genuinely binary image", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(
          new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]).buffer,
        ),
    });

    renderViewer("real.png", "plain");

    expect(
      await screen.findByTestId("file-content-viewer-binary-fallback"),
    ).toBeInTheDocument();
  });
});
