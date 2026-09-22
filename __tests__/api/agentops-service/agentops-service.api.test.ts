import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import AgentOpsService, {
  AgentOpsUnavailableError,
} from "#/api/agentops-service/agentops-service.api";
import { getFetchCall, mockJsonResponse } from "../cloud/fetch-test-utils";

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  fetchMock.mockReset();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("AgentOpsService empty-body responses", () => {
  it("throws AgentOpsUnavailableError instead of a raw destructure crash when the collector answers 200 with an empty body", async () => {
    // Every real collector route sends a JSON body on success
    // (scripts/agentops-server.mjs's sendJson calls) — an empty 200 only
    // happens if something between the browser and the collector (a
    // misbehaving proxy) ate the body. getRuns() destructures `{ runs }`
    // from the parsed response, which used to throw an opaque
    // "Cannot destructure property 'runs' of null" TypeError instead of
    // the collector-unavailable messaging callers already handle.
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    await expect(AgentOpsService.getRuns()).rejects.toThrow(
      AgentOpsUnavailableError,
    );
  });

  it("still parses a normal, non-empty JSON body", async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ runs: [{ runId: "r1" }] }));

    const runs = await AgentOpsService.getRuns();

    expect(runs).toEqual([{ runId: "r1" }]);
    const [url] = getFetchCall(fetchMock);
    expect(url).toBe("http://localhost:8000/api/agentops/runs");
  });
});
