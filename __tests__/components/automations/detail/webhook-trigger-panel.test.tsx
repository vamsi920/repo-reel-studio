import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { WebhookTriggerPanel } from "#/components/features/automations/detail/webhook-trigger-panel";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import AutomationService from "#/api/automation-service/automation-service.api";
import { rememberWebhookSecret } from "#/utils/automation-webhook";

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    listCustomWebhooks: vi.fn(),
    rotateWebhookSecret: vi.fn(),
    sendWebhookTestEvent: vi.fn(),
  },
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

const HOOK = {
  id: "w1",
  org_id: "o",
  name: "Deploy watch",
  source: "deploy-watch-ab12",
  webhook_url:
    "http://localhost:8000/api/automation/v1/events/o/deploy-watch-ab12",
  event_key_expr: "type",
  signature_header: "X-Signature-256",
  enabled: true,
};

function renderPanel(source: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <WebhookTriggerPanel automationId="a1" source={source} />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  __resetActiveStoreForTests();
  setRegisteredBackends([
    {
      id: "local-1",
      name: "Local",
      host: "http://localhost:8000",
      apiKey: "k",
      kind: "local",
    },
  ]);
  setActiveSelection({ backendId: "local-1" });
  vi.mocked(AutomationService.listCustomWebhooks).mockResolvedValue([HOOK]);
});

afterEach(() => {
  __resetActiveStoreForTests();
  vi.clearAllMocks();
});

describe("WebhookTriggerPanel", () => {
  it("shows the secret once after creation and sends a signed test event", async () => {
    const user = userEvent.setup();
    rememberWebhookSecret(HOOK.source, "whsec_fresh");
    vi.mocked(AutomationService.sendWebhookTestEvent).mockResolvedValue(1);

    renderPanel(HOOK.source);

    expect(await screen.findByTestId("webhook-url")).toHaveTextContent(
      HOOK.webhook_url,
    );
    expect(screen.getByTestId("webhook-secret")).toHaveTextContent(
      "whsec_fresh",
    );
    await user.click(screen.getByTestId("webhook-send-test"));
    expect(AutomationService.sendWebhookTestEvent).toHaveBeenCalledWith({
      webhook_url: HOOK.webhook_url,
      signature_header: "X-Signature-256",
      secret: "whsec_fresh",
    });
  });

  it("hides an unknown secret until a new one is generated", async () => {
    const user = userEvent.setup();
    vi.mocked(AutomationService.rotateWebhookSecret).mockResolvedValue(
      "whsec_rotated",
    );
    vi.mocked(AutomationService.listCustomWebhooks).mockResolvedValue([
      { ...HOOK, source: "other-hook" },
    ]);

    renderPanel("other-hook");

    await screen.findByTestId("webhook-url");
    expect(screen.queryByTestId("webhook-secret")).toBeNull();
    expect(screen.queryByTestId("webhook-send-test")).toBeNull();
    await user.click(screen.getByTestId("webhook-rotate-secret"));
    await waitFor(() =>
      expect(screen.getByTestId("webhook-secret")).toHaveTextContent(
        "whsec_rotated",
      ),
    );
  });
});
