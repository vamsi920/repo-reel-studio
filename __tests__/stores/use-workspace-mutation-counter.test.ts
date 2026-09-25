import { describe, expect, it } from "vitest";

import {
  useWorkspaceMutationCounter,
  withWorkspaceCacheBuster,
} from "#/stores/use-workspace-mutation-counter";

describe("useWorkspaceMutationCounter", () => {
  it("starts at 0 and increments on each bump", () => {
    useWorkspaceMutationCounter.setState({ count: 0 });

    useWorkspaceMutationCounter.getState().bump();
    useWorkspaceMutationCounter.getState().bump();

    expect(useWorkspaceMutationCounter.getState().count).toBe(2);
  });
});

describe("withWorkspaceCacheBuster", () => {
  it("appends a v= query param to a plain static-fileserver URL", () => {
    expect(
      withWorkspaceCacheBuster(
        "https://agent.example.com/workspace/index.html",
        3,
      ),
    ).toBe("https://agent.example.com/workspace/index.html?v=3");
  });

  it("appends with & when the URL already has a query string", () => {
    expect(
      withWorkspaceCacheBuster(
        "https://agent.example.com/workspace/index.html?raw=1",
        3,
      ),
    ).toBe("https://agent.example.com/workspace/index.html?raw=1&v=3");
  });

  it("passes null through unchanged", () => {
    expect(withWorkspaceCacheBuster(null, 3)).toBeNull();
  });

  // Regression: the cloud backend's `staticUrl` is a `data:` URI (see the
  // cloud branch of `useWorkspaceFileContent`) whose bytes after the comma
  // are the literal payload, not a request the browser re-issues. Appending
  // `?v=<n>` used to land inside the base64 data itself, producing an
  // invalid data URI that fails to decode instead of a refreshed
  // image/PDF/iframe preview.
  it("returns a data: URI unchanged instead of corrupting its base64 payload", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA";

    expect(withWorkspaceCacheBuster(dataUri, 5)).toBe(dataUri);
  });
});
