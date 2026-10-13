// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildWebhookCurl,
  isCustomWebhookSource,
  signWebhookBody,
  webhookSourceFor,
} from "#/utils/automation-webhook";

describe("automation webhooks", () => {
  it("derives a valid, unique-looking source from the automation name", () => {
    expect(webhookSourceFor("Deploy failed → triage!", "AB12cd")).toBe(
      "deploy-failed-triage-ab12cd",
    );
    expect(webhookSourceFor("!!!", "x9")).toBe("webhook-x9");
    expect(webhookSourceFor("a".repeat(80), "zz").length).toBeLessThanOrEqual(
      50,
    );
  });

  it("signs exactly like the automation service verifies (HMAC-SHA256 hex)", async () => {
    const body = '{"type":"test"}';
    const expected = createHmac("sha256", "s3cret").update(body).digest("hex");

    await expect(signWebhookBody(body, "s3cret")).resolves.toBe(
      `sha256=${expected}`,
    );
  });

  it("quotes the secret and URL in the copy-paste test command", () => {
    const curl = buildWebhookCurl({
      url: "http://localhost:8000/api/automation/v1/events/o/s",
      header: "X-Signature-256",
      secret: "it's",
    });

    expect(curl).toContain("-hmac 'it'\\''s'");
    expect(curl).toContain('-H "X-Signature-256: sha256=$SIG"');
  });

  it("never treats built-in sources as an automation's own webhook", () => {
    expect(isCustomWebhookSource("github")).toBe(false);
    expect(isCustomWebhookSource("jira")).toBe(false);
    expect(isCustomWebhookSource("deploy-watch-ab12")).toBe(true);
  });
});
