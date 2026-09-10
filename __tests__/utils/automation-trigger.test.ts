import { describe, it, expect } from "vitest";
import { isUnsupportedEventTrigger } from "#/utils/automation-trigger";

describe("isUnsupportedEventTrigger", () => {
  it("flags a github event trigger as unsupported", () => {
    expect(
      isUnsupportedEventTrigger({ type: "event", source: "github" }),
    ).toBe(true);
  });

  it("does not flag a jira event trigger", () => {
    expect(
      isUnsupportedEventTrigger({ type: "event", source: "jira" }),
    ).toBe(false);
  });

  it("does not flag a schedule/cron trigger even with a source set", () => {
    expect(
      isUnsupportedEventTrigger({ type: "cron", source: "github" }),
    ).toBe(false);
  });

  it("does not flag an event trigger with no source", () => {
    expect(isUnsupportedEventTrigger({ type: "event" })).toBe(false);
  });
});
