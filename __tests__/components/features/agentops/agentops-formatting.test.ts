import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTIVE_RUN_STATUSES,
  ACTIVE_RUN_STATUSES_QUERY,
  formatElapsed,
  parseTimestamp,
} from "#/components/features/agentops/agentops-formatting";

describe("parseTimestamp", () => {
  // Regression: rows recorded from agent-server events carry offset-less
  // timestamps; `new Date()` reads those as local time, so a tool call and
  // the "run completed" row two seconds later rendered hours apart in EDT.
  it("reads an offset-less ISO timestamp as UTC, not local time", () => {
    expect(parseTimestamp("2026-09-14T01:53:30.400286")).toBe(
      Date.UTC(2026, 8, 14, 1, 53, 30, 400),
    );
    expect(parseTimestamp("2026-09-14T01:53:30.400286")).toBe(
      parseTimestamp("2026-09-14T01:53:30.400Z"),
    );
  });

  it("leaves zoned timestamps unchanged", () => {
    expect(parseTimestamp("2026-09-14T01:53:49.794Z")).toBe(
      Date.UTC(2026, 8, 14, 1, 53, 49, 794),
    );
    expect(parseTimestamp("2026-09-13T21:53:49-04:00")).toBe(
      Date.UTC(2026, 8, 14, 1, 53, 49),
    );
  });

  it("keeps elapsed time right across a naive start and a zoned end", () => {
    expect(
      formatElapsed("2026-09-14T01:52:55.122847", "2026-09-14T01:53:49.794Z"),
    ).toBe("55s");
  });
});

describe("ACTIVE_RUN_STATUSES", () => {
  it("excludes 'idle', matching the collector's own isActiveStatus()", () => {
    // scripts/agentops/map-events.mjs's isActiveStatus() — the source of
    // summary.activeRuns on the Overview stat tile — is exactly these four
    // statuses. "idle" (session open, agent not working) is deliberately not
    // counted as active anywhere else, so this list shouldn't count it either.
    expect(ACTIVE_RUN_STATUSES).toEqual([
      "running",
      "paused",
      "waiting_for_confirmation",
      "stuck",
    ]);
    expect(ACTIVE_RUN_STATUSES).not.toContain("idle");
  });

  it("joins into the comma-separated query string both routes send", () => {
    expect(ACTIVE_RUN_STATUSES_QUERY).toBe(
      "running,paused,waiting_for_confirmation,stuck",
    );
  });
});

/**
 * Regression guard for the bug this constant fixed: agentops-overview.tsx and
 * agentops-live-runs.tsx each used to hardcode their own status list, and the
 * two silently drifted apart (Live Runs additionally included "idle"), so a
 * user saw a different run count on the Overview tile than clicking "View
 * all" into the full Live Runs page. Reading the source directly rather than
 * rendering both routes keeps this test cheap while still catching either
 * file going back to a local, independently-editable list.
 */
describe("agentops-overview and agentops-live-runs share one active-status list", () => {
  const overviewSource = readFileSync(
    resolve(__dirname, "../../../../src/routes/agentops-overview.tsx"),
    "utf-8",
  );
  const liveRunsSource = readFileSync(
    resolve(__dirname, "../../../../src/routes/agentops-live-runs.tsx"),
    "utf-8",
  );

  it("both import the shared ACTIVE_RUN_STATUSES_QUERY constant", () => {
    expect(overviewSource).toContain("ACTIVE_RUN_STATUSES_QUERY");
    expect(liveRunsSource).toContain("ACTIVE_RUN_STATUSES_QUERY");
  });

  it("neither route redefines its own local status list", () => {
    expect(overviewSource).not.toMatch(/const ACTIVE_STATUSES\s*=/);
    expect(liveRunsSource).not.toMatch(/const ACTIVE_STATUSES\s*=/);
  });
});
