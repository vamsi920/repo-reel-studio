import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import type { Automation, AutomationSpec } from "#/types/automation";
import AutomationService, {
  __resetAutomationBaseUrlForTests,
} from "./automation-service.api";

const {
  localAxios,
  callCloudProxy,
  clearPendingLocalTelemetryRevocation,
  getTelemetryConsent,
  getTelemetryDistinctId,
  getTelemetryDistinctIdForConsentSync,
} = vi.hoisted(() => ({
  localAxios: {
    interceptors: { request: { use: vi.fn() } },
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  callCloudProxy: vi.fn(),
  clearPendingLocalTelemetryRevocation: vi.fn(),
  getTelemetryConsent: vi.fn(),
  getTelemetryDistinctId: vi.fn(),
  getTelemetryDistinctIdForConsentSync: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    create: () => localAxios,
    post: vi.fn(),
  },
}));

vi.mock("#/api/cloud/proxy", () => ({
  callCloudProxy,
}));

vi.mock("#/services/telemetry", () => ({
  clearPendingLocalTelemetryRevocation,
  getTelemetryConsent,
  getTelemetryDistinctId,
  getTelemetryDistinctIdForConsentSync,
}));

const localBackend: Backend = {
  id: "local-test",
  name: "Local test backend",
  host: "http://localhost:3000",
  apiKey: "test-session-key",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-test",
  name: "Cloud test backend",
  host: "https://app.example.test",
  apiKey: "cloud-api-key",
  kind: "cloud",
};

const spec: AutomationSpec = {
  name: "Imported review",
  prompt: "Review open pull requests.",
  trigger: {
    type: "cron",
    schedule: "0 9 * * *",
    schedule_human: "Daily at 09:00",
  },
  enabled: true,
  repository: "openhands/agent-canvas",
  branch: "main",
  plugins: ["github:openhands/extensions"],
  model: "fast",
  timezone: "America/Los_Angeles",
};

const createdAutomation: Automation = {
  id: "created-automation",
  name: spec.name,
  prompt: spec.prompt,
  trigger: { type: "cron", schedule: spec.trigger.schedule },
  enabled: true,
  model: spec.model,
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:00:00Z",
};

describe("AutomationService.getSdkVersion", () => {
  beforeEach(() => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
  });

  afterEach(() => {
    setActiveSelection(null);
    setRegisteredBackends([]);
    vi.clearAllMocks();
  });

  it("fetches the local automation SDK version from the automation sidecar", async () => {
    localAxios.get.mockResolvedValueOnce({ data: { sdk_version: "1.36.1" } });

    await expect(AutomationService.getSdkVersion()).resolves.toBe("1.36.1");

    expect(localAxios.get).toHaveBeenCalledWith("/api/automation/sdk-version", {
      timeout: 5000,
    });
  });

  it("fetches the cloud automation SDK version through the cloud proxy", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: "org-1" });
    callCloudProxy.mockResolvedValueOnce({ sdk_version: "1.36.2" });

    await expect(AutomationService.getSdkVersion()).resolves.toBe("1.36.2");

    expect(callCloudProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: cloudBackend,
        method: "GET",
        path: "/api/automation/sdk-version",
        headers: expect.objectContaining({ "X-Org-Id": "org-1" }),
        timeoutSeconds: 5,
      }),
    );
  });

  it("returns null when the SDK version endpoint is unavailable", async () => {
    localAxios.get.mockRejectedValueOnce(new Error("not running"));

    await expect(AutomationService.getSdkVersion()).resolves.toBeNull();
  });
});

describe("AutomationService.syncTelemetryConsent", () => {
  beforeEach(() => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
    getTelemetryConsent.mockReturnValue("pending");
    getTelemetryDistinctIdForConsentSync.mockResolvedValue("ph-fe-sync");
    localAxios.post.mockResolvedValue({ data: { consent_granted: true } });
  });

  afterEach(() => {
    setActiveSelection(null);
    setRegisteredBackends([]);
    vi.clearAllMocks();
  });

  it("posts local telemetry consent with the frontend PostHog distinct ID", async () => {
    await AutomationService.syncTelemetryConsent("granted");

    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/telemetry/consent",
      {
        consent_granted: true,
        frontend_distinct_id: "ph-fe-sync",
      },
      { timeout: 5000 },
    );
  });

  it("uses the current telemetry consent when no explicit value is supplied", async () => {
    getTelemetryConsent.mockReturnValue("denied");

    await AutomationService.syncTelemetryConsent();

    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/telemetry/consent",
      {
        consent_granted: false,
        frontend_distinct_id: "ph-fe-sync",
      },
      { timeout: 5000 },
    );
    expect(clearPendingLocalTelemetryRevocation).toHaveBeenCalledWith(
      "ph-fe-sync",
    );
  });

  it("skips cloud backends because cloud consent is handled by auth", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: "org-1" });

    await AutomationService.syncTelemetryConsent("granted");

    expect(localAxios.post).not.toHaveBeenCalled();
  });
});

describe("AutomationService.createAutomation", () => {
  beforeEach(() => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
    localAxios.post.mockResolvedValue({ data: createdAutomation });
    localAxios.patch.mockImplementation(
      async (_path: string, body: Partial<Automation>) => ({
        data: { ...createdAutomation, ...body },
      }),
    );
  });

  afterEach(() => {
    setActiveSelection(null);
    setRegisteredBackends([]);
    vi.clearAllMocks();
  });

  it("creates plugin automations through the preset API and disables them", async () => {
    const created = await AutomationService.createAutomation(spec);

    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/preset/plugin",
      {
        name: spec.name,
        prompt: spec.prompt,
        model: spec.model,
        trigger: {
          type: "event",
          source: "agent-canvas-import",
          on: expect.stringMatching(/^pending\./),
        },
        repos: [
          {
            url: spec.repository,
            ref: spec.branch,
            provider: "github",
          },
        ],
        plugins: [{ source: spec.plugins![0] }],
      },
      {
        baseURL: localBackend.host,
        headers: expect.objectContaining({
          "X-Session-API-Key": localBackend.apiKey,
        }),
      },
    );
    expect(localAxios.patch).toHaveBeenCalledWith(
      "/api/automation/v1/created-automation",
      {
        trigger: {
          type: "cron",
          schedule: spec.trigger.schedule,
          timezone: spec.timezone,
        },
        enabled: false,
      },
      {
        baseURL: localBackend.host,
        headers: expect.objectContaining({
          "X-Session-API-Key": localBackend.apiKey,
        }),
      },
    );
    expect(created.enabled).toBe(false);
  });

  it("uses the prompt preset path when no plugins are configured", async () => {
    await AutomationService.createAutomation({
      ...spec,
      plugins: undefined,
    });

    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/preset/prompt",
      expect.not.objectContaining({ plugins: expect.anything() }),
      expect.any(Object),
    );
  });

  it("applies the imported event trigger while disabling the automation", async () => {
    const eventTrigger = {
      type: "event",
      source: "github",
      on: ["pull_request.opened", "pull_request.synchronize"],
      filter: "repository.full_name == 'openhands/agent-canvas'",
    };

    await AutomationService.createAutomation({
      ...spec,
      trigger: eventTrigger,
    });

    expect(localAxios.patch).toHaveBeenCalledWith(
      "/api/automation/v1/created-automation",
      { trigger: eventTrigger, enabled: false },
      expect.any(Object),
    );
  });

  it("uses the selected cloud backend and organization for both requests", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: "org-1" });
    callCloudProxy
      .mockResolvedValueOnce(createdAutomation)
      .mockResolvedValueOnce({ ...createdAutomation, enabled: false });

    const created = await AutomationService.createAutomation(spec);

    expect(callCloudProxy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        backend: cloudBackend,
        method: "POST",
        path: "/api/automation/v1/preset/plugin",
        body: expect.objectContaining({ name: spec.name }),
        headers: expect.objectContaining({ "X-Org-Id": "org-1" }),
      }),
    );
    expect(callCloudProxy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        backend: cloudBackend,
        method: "PATCH",
        path: "/api/automation/v1/created-automation",
        body: expect.objectContaining({ enabled: false }),
        headers: expect.objectContaining({ "X-Org-Id": "org-1" }),
      }),
    );
    expect(created.enabled).toBe(false);
  });

  it("removes the inert automation when disabling it fails", async () => {
    const updateError = new Error("update failed");
    localAxios.patch.mockRejectedValueOnce(updateError);

    await expect(AutomationService.createAutomation(spec)).rejects.toBe(
      updateError,
    );

    expect(localAxios.delete).toHaveBeenCalledWith(
      "/api/automation/v1/created-automation",
      {
        baseURL: localBackend.host,
        headers: expect.objectContaining({
          "X-Session-API-Key": localBackend.apiKey,
        }),
      },
    );
  });

  it("includes the timeout in the create request when the spec sets one", async () => {
    await AutomationService.createAutomation({ ...spec, timeout: 1200 });

    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/preset/plugin",
      expect.objectContaining({ timeout: 1200 }),
      expect.any(Object),
    );
  });
});

describe("AutomationService.downloadTarball", () => {
  beforeEach(() => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
  });

  afterEach(() => {
    setActiveSelection(null);
    setRegisteredBackends([]);
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("clicks an anchor that is attached to the document", async () => {
    // Arrange — jsdom has no object-URL support, so stub both halves.
    const createObjectURL = vi.fn(() => "blob:automation-tarball");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    localAxios.get.mockResolvedValueOnce({ data: new Blob(["tar"]) });

    // A detached anchor is a no-op in Firefox, so record whether the element
    // was in the document at the moment it was clicked.
    let attachedAtClick = false;
    let downloadAtClick: string | undefined;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click(this: HTMLAnchorElement) {
        attachedAtClick = document.body.contains(this);
        downloadAtClick = this.download;
      });

    // Act
    await AutomationService.downloadTarball("auto-1", "Daily digest");

    // Assert — attached, named, and only then revoked.
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(attachedAtClick).toBe(true);
    expect(downloadAtClick).toBe("Daily digest.tar");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:automation-tarball");

    vi.unstubAllGlobals();
  });
});

describe("automation base URL resolution", () => {
  // Both hosts differ from this app's origin, so each one has to be probed.
  const firstLocalBackend: Backend = {
    ...localBackend,
    id: "local-first",
    name: "First local backend",
    host: "http://localhost:8000",
  };
  const secondLocalBackend: Backend = {
    ...localBackend,
    id: "local-second",
    name: "Second local backend",
    host: "http://localhost:9000",
    apiKey: "second-session-key",
  };

  /** The request interceptor the module installs at import time. */
  const requestInterceptor = localAxios.interceptors.request.use.mock
    .calls[0][0] as (config: {
    baseURL?: string;
    headers: { set: (name: string, value: string) => void };
  }) => Promise<{ baseURL?: string }>;

  beforeEach(() => {
    __resetAutomationBaseUrlForTests();
    localAxios.get.mockReset();
    getTelemetryDistinctId.mockResolvedValue(null);
    setRegisteredBackends([firstLocalBackend, secondLocalBackend]);
  });

  afterEach(() => {
    __resetAutomationBaseUrlForTests();
    setActiveSelection(null);
    setRegisteredBackends([]);
    vi.clearAllMocks();
  });

  it("resolves each host independently when two resolutions overlap", async () => {
    // Arrange — the first backend does not serve the automation mount, so it
    // falls back to this app's origin; the second serves it directly. Probes
    // are deferred so both resolutions are in flight at the same time.
    const origin = window.location.origin;
    const deferred: Array<() => void> = [];
    localAxios.get.mockImplementation(
      (_path: string, config: { baseURL?: string }) =>
        new Promise((resolve) => {
          deferred.push(() => {
            const servesMount =
              config.baseURL === origin ||
              config.baseURL === secondLocalBackend.host;
            resolve({ data: { status: servesMount ? "ok" : "error" } });
          });
        }),
    );

    const makeConfig = () => ({ headers: { set: vi.fn() } });
    /**
     * Waits until the interceptor has issued its next health probe. Bounded so
     * a regression that never probes fails here rather than at the timeout.
     */
    const waitForProbe = async (count: number) => {
      for (let i = 0; i < 50; i += 1) {
        if (localAxios.get.mock.calls.length >= count) return;
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      }
      throw new Error(
        `Expected ${String(count)} automation health probes, saw ${String(
          localAxios.get.mock.calls.length,
        )}`,
      );
    };

    // Act — start a request under the first backend and let it reach its
    // probe, then switch backends and start a second request while the first
    // resolution is still in flight.
    setActiveSelection({ backendId: firstLocalBackend.id });
    const first = requestInterceptor(makeConfig());
    await waitForProbe(1);
    setActiveSelection({ backendId: secondLocalBackend.id });
    const second = requestInterceptor(makeConfig());
    await waitForProbe(2);

    // Let every pending probe answer; the first resolution queues another one
    // when it moves on to the origin fallback.
    for (let i = 0; i < 5; i += 1) {
      while (deferred.length > 0) deferred.shift()?.();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    // Assert — the second request keeps its own host. Sharing a single
    // in-flight promise handed it the first backend's base URL instead, so a
    // request built for one backend was sent to another.
    await expect(first).resolves.toMatchObject({ baseURL: origin });
    await expect(second).resolves.toMatchObject({
      baseURL: secondLocalBackend.host,
    });
  });
});

describe("pinned local requests", () => {
  // A host registered by `dev:minimal` — the bare agent-server, which has no
  // `/api/automation` mount — while this app's own origin does serve it.
  const bareHostBackend: Backend = {
    ...localBackend,
    id: "local-bare",
    name: "Bare agent-server",
    host: "http://localhost:18000",
  };

  beforeEach(() => {
    __resetAutomationBaseUrlForTests();
    getTelemetryDistinctId.mockResolvedValue(null);
    setRegisteredBackends([bareHostBackend]);
    setActiveSelection({ backendId: bareHostBackend.id });
    localAxios.get.mockImplementation(
      async (_path: string, config: { baseURL?: string }) => ({
        data: {
          status: config.baseURL === window.location.origin ? "ok" : "error",
        },
      }),
    );
    localAxios.post.mockResolvedValue({ data: createdAutomation });
    localAxios.patch.mockImplementation(
      async (_path: string, body: Partial<Automation>) => ({
        data: { ...createdAutomation, ...body },
      }),
    );
  });

  afterEach(() => {
    __resetAutomationBaseUrlForTests();
    setActiveSelection(null);
    setRegisteredBackends([]);
    vi.clearAllMocks();
  });

  it("imports through the same resolved mount as every other local call", async () => {
    // Arrange — see beforeEach: the registered host fails the health probe,
    // the origin passes it. Every interceptor-routed call already falls back
    // to the origin; the pinned import config used to send the POST and PATCH
    // to the raw host instead, so importing 404'd on a page that otherwise
    // worked.
    // Act
    await AutomationService.createAutomation(spec);

    // Assert — both pinned requests carry the resolved origin and the
    // backend's own session key.
    const origin = window.location.origin;
    expect(localAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        baseURL: origin,
        headers: expect.objectContaining({
          "X-Session-API-Key": bareHostBackend.apiKey,
        }),
      }),
    );
    expect(localAxios.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ baseURL: origin }),
    );
  });

  it("registers custom webhooks through the resolved mount too", async () => {
    // Arrange
    localAxios.post.mockResolvedValueOnce({
      data: {
        id: "wh-1",
        org_id: "org-1",
        webhook_url: "https://hooks.example.test/wh-1",
        webhook_secret: null,
        signature_header: "X-Signature",
      },
    });

    // Act
    await AutomationService.createCustomWebhook({
      name: "Jira",
      source: "jira",
      event_key_expr: "webhookEvent",
    });

    // Assert
    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/webhooks",
      expect.any(Object),
      expect.objectContaining({ baseURL: window.location.origin }),
    );
  });

  it("keeps the registered host when neither it nor the origin serves the mount", async () => {
    // Arrange — a genuine outage must surface against the real host, not be
    // redirected somewhere equally unproven.
    localAxios.get.mockResolvedValue({ data: { status: "error" } });

    // Act
    await AutomationService.createAutomation(spec);

    // Assert
    expect(localAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ baseURL: bareHostBackend.host }),
    );
  });
});
