import { describe, it, expect } from "vitest";
import { isRateLimitErrorDetail } from "#/components/features/home/featured-automations/automation-run-health";

describe("isRateLimitErrorDetail", () => {
  it.each([
    [
      "litellm RESOURCE_EXHAUSTED wrapping a Gemini daily quota rejection",
      'litellm.RateLimitError: geminiException - {"error":{"code":429,"message":"Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 250, model: gemini-3.1-pro","status":"RESOURCE_EXHAUSTED"}}',
    ],
    ["a bare RateLimitError class name", "litellm.RateLimitError: some provider message"],
    ["a lowercase 'rate limit' phrase", "You have hit the rate limit for this account"],
    ["a hyphenated 'rate-limit' phrase", "rate-limit exceeded, please retry later"],
    ["the word 'quota' on its own", "Daily quota exhausted for this model"],
  ])("returns true for %s", (_label, detail) => {
    expect(isRateLimitErrorDetail(detail)).toBe(true);
  });

  it.each([
    ["a sandbox provisioning failure", "sandbox provisioning failed: connection refused"],
    ["an authentication error", "litellm.AuthenticationError: invalid API key"],
    ["an empty string", ""],
  ])("returns false for %s", (_label, detail) => {
    expect(isRateLimitErrorDetail(detail)).toBe(false);
  });
});
