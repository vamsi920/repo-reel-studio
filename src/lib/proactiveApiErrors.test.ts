import { describe, expect, it } from "vitest";
import {
  extractHttpErrorParts,
  formatProactiveApiErrorDetail,
  normalizeErrorText,
} from "@/lib/proactiveAgentOps";

describe("proactive API error formatting", () => {
  it("normalizeErrorText maps missing proactive route", () => {
    const msg = normalizeErrorText("Cannot GET /api/proactive/status");
    expect(msg).toContain("proactive routes");
  });

  it("formatProactiveApiErrorDetail reads structured detail", () => {
    const msg = formatProactiveApiErrorDetail({
      message: "repoUrl is required",
      code: "missing_repo_url",
      field: "repoUrl",
    });
    expect(msg).toContain("repoUrl");
    expect(msg).toContain("repoUrl is required");
    expect(msg).toContain("missing_repo_url");
  });

  it("formatProactiveApiErrorDetail appends hint", () => {
    const msg = formatProactiveApiErrorDetail({
      message: "Invalid proactive cron token",
      code: "invalid_cron_token",
      hint: "Send Authorization: Bearer <PROACTIVE_CRON_TOKEN>",
    });
    expect(msg).toContain("Invalid proactive cron token");
    expect(msg).toContain("[redacted]");
    expect(msg).not.toContain("PROACTIVE_CRON_TOKEN");
  });

  it("formatProactiveApiErrorDetail flattens validation arrays", () => {
    const msg = formatProactiveApiErrorDetail([
      { loc: ["query", "repoUrl"], msg: "Field required", type: "missing" },
    ]);
    expect(msg).toContain("repoUrl");
    expect(msg).toContain("Field required");
  });

  it("extractHttpErrorParts unwraps nested detail before formatting", () => {
    const { detail } = extractHttpErrorParts({
      detail: {
        message: "Dispatch failed",
        code: "dispatch_failed",
        detail: { message: "should not win", code: "inner" },
      },
    });
    const msg = formatProactiveApiErrorDetail(detail);
    expect(msg).toContain("Dispatch failed");
    expect(msg).toContain("dispatch_failed");
  });
});
