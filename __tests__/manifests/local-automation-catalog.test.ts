import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEOUT_SECONDS_BY_ID,
  HONESTY_RULE,
  LOCAL_AUTOMATION_CATALOG,
  LOCAL_FEATURED_AUTOMATION_IDS,
  PR_BODY_RULE,
  SUPERSEDES_PUBLISHED_ID,
} from "#/manifests/local-automation-catalog";
import * as promptRules from "#/manifests/automation-prompt-rules";
import {
  AUTOMATION_CATALOG_ALL,
  SETUP_REGISTRY,
} from "#/manifests/manifest-sources";
import { validateSetupEntry } from "#/manifests/manifest-validation";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";

/** A cron minute field's implied interval in minutes, or null if it isn't a star-slash-N pattern. */
function impliedIntervalMinutes(schedule: string): number | null {
  const minuteField = schedule.trim().split(/\s+/)[0];
  const everyN = /^\*\/(\d+)$/.exec(minuteField);
  return everyN ? Number(everyN[1]) : null;
}

describe("local automation catalog", () => {
  it("declares at least one entry", () => {
    expect(LOCAL_AUTOMATION_CATALOG.length).toBeGreaterThan(0);
  });

  it.each(LOCAL_AUTOMATION_CATALOG.map((entry) => [entry.id, entry]))(
    "%s passes host admission",
    (_id, entry) => {
      const result = validateSetupEntry(entry);
      // Surface the reasons rather than a bare false — a rejected entry is
      // silently dropped from the registry at runtime.
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    },
  );

  it.each(LOCAL_AUTOMATION_CATALOG.map((entry) => [entry.id, entry]))(
    "%s creates a real automation on a cron trigger",
    (_id, entry) => {
      // "direct" is what makes completing the form POST to the service.
      // Anything else only opens a chat, which is the gap these entries close.
      expect(entry.setup?.mode).toBe("direct");
      expect(entry.setup?.prompt).toBeTruthy();
      // Event triggers never fire without webhook delivery reaching the
      // deployment, so every local entry polls instead.
      expect(Object.keys(entry.setup?.form.triggers ?? {})).toEqual(["cron"]);
    },
  );

  it("never polls more often than the service's 300s floor", () => {
    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      const schedule = entry.setup?.form.triggers?.cron?.schedule?.default;
      expect(schedule, `${entry.id} must default its schedule`).toBeTruthy();
      const minuteField = String(schedule).trim().split(/\s+/)[0];
      const everyN = /^\*\/(\d+)$/.exec(minuteField);
      if (everyN) {
        expect(
          Number(everyN[1]),
          `${entry.id} polls faster than the 5 minute floor`,
        ).toBeGreaterThanOrEqual(5);
      }
    });
  });

  it("declares at least one integration so the card is not hidden", () => {
    // `isAutomationAvailable` hides an entry with no integrations.
    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      expect(
        Object.keys(entry.requires.integrations).length,
        `${entry.id} would be hidden from the catalog`,
      ).toBeGreaterThan(0);
    });
  });

  it("does not declare features that could mark it unsupported", () => {
    // A feature the deployment does not report renders the card unavailable.
    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      expect(entry.requires.features, `${entry.id}`).toBeUndefined();
    });
  });

  it("reuses the shared rule constants rather than redefining them", () => {
    // Regression guard for the exact drift that left the Proactivation wizard
    // without PR_BODY_RULE: HONESTY_RULE/PR_BODY_RULE must be the one copy in
    // automation-prompt-rules.ts, re-exported here, not a second definition.
    expect(HONESTY_RULE).toBe(promptRules.HONESTY_RULE);
    expect(PR_BODY_RULE).toBe(promptRules.PR_BODY_RULE);
  });

  it("names a predictable neodevex/<slug> branch in every prompt", () => {
    // Both the duplicate-PR dedup instruction and the Pull Requests review
    // page's automation attribution depend on every branch this fork's
    // automations create following this exact prefix.
    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      expect(
        entry.setup?.prompt,
        `${entry.id} prompt must instruct a neodevex/<slug> branch name`,
      ).toMatch(/neodevex\/[a-z0-9-]+\//);
    });
  });

  it("gives every test-running automation an explicit timeout", () => {
    // buildCreatePayload only sends a timeout when the id is in this map --
    // an automation whose prompt runs a test suite (implying clone + install +
    // test, the slow path) must not be left on the service's 600s default. A
    // `repository` field alone isn't the right signal: slack-standup-digest
    // has one but only reads PR/commit data through the API, no cloning.
    const testRunningIds = LOCAL_AUTOMATION_CATALOG.filter((entry) =>
      /run (the )?(relevant |full )*test/i.test(entry.setup?.prompt ?? ""),
    ).map((entry) => entry.id);
    expect(testRunningIds.length).toBeGreaterThan(0); // sanity: the regex matches something

    testRunningIds.forEach((id) => {
      expect(
        DEFAULT_TIMEOUT_SECONDS_BY_ID[id],
        `${id} clones a repository but has no default timeout`,
      ).toBeGreaterThan(0);
    });
  });

  it("spaces every cron schedule safely above its own timeout", () => {
    // The automation service has no built-in guard against two runs of the
    // same automation overlapping -- this exact gap caused a real OOM crash
    // when a 2-minute schedule overlapped a run that needed far longer. The
    // only defense available is spacing the schedule comfortably beyond the
    // timeout, with margin for scheduler jitter.
    const MARGIN_SECONDS = 5 * 60;

    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      const timeoutSeconds = DEFAULT_TIMEOUT_SECONDS_BY_ID[entry.id];
      if (!timeoutSeconds) return; // no repo cloning, service default is fine

      const schedule = String(
        entry.setup?.form.triggers?.cron?.schedule?.default ?? "",
      );
      const intervalMinutes = impliedIntervalMinutes(schedule);
      // A non-`*/N` schedule (hourly/daily/weekly) always clears the margin.
      if (intervalMinutes === null) return;

      const intervalSeconds = intervalMinutes * 60;
      expect(
        intervalSeconds,
        `${entry.id}: ${schedule} (every ${intervalMinutes}m = ${intervalSeconds}s) leaves no ${MARGIN_SECONDS}s margin above its ${timeoutSeconds}s timeout`,
      ).toBeGreaterThanOrEqual(timeoutSeconds + MARGIN_SECONDS);
    });
  });

  it("uses only even divisors of 60 for every-N-minute schedules", () => {
    // A schedule like */25 fires at :00/:25/:50 then again at :00 -- a 10
    // minute gap once an hour, not the nominal 25. Any interval must divide
    // 60 evenly so every gap is actually uniform.
    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      const schedule = String(
        entry.setup?.form.triggers?.cron?.schedule?.default ?? "",
      );
      const intervalMinutes = impliedIntervalMinutes(schedule);
      if (intervalMinutes === null) return;

      expect(
        60 % intervalMinutes,
        `${entry.id}: */${intervalMinutes} does not evenly divide 60, so its gaps are uneven`,
      ).toBe(0);
    });
  });
});

describe("merged catalog", () => {
  it("replaces a superseded published entry in the displayed catalog", () => {
    const ids = AUTOMATION_CATALOG_ALL.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    Object.entries(SUPERSEDES_PUBLISHED_ID).forEach(
      ([localId, publishedId]) => {
        expect(
          ids,
          `${publishedId} should be replaced by ${localId}`,
        ).not.toContain(publishedId);
        expect(ids).toContain(localId);
      },
    );
  });

  it("keeps superseded published entries resolvable for their contract fixtures", () => {
    // The package pins fixtures against these ids; dropping them from the
    // registry would break the published contract even though the card is gone.
    Object.values(SUPERSEDES_PUBLISHED_ID).forEach((publishedId) => {
      expect(
        SETUP_REGISTRY.findById(publishedId) ??
          AUTOMATION_CATALOG.find((entry) => entry.id === publishedId),
        `${publishedId} is no longer resolvable`,
      ).toBeTruthy();
    });
  });

  it("registers every local entry in the setup registry", () => {
    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      expect(
        SETUP_REGISTRY.findById(entry.id),
        `${entry.id} was rejected at admission`,
      ).not.toBeNull();
    });
  });

  it("features only ids that exist in the merged catalog", () => {
    const ids = new Set(AUTOMATION_CATALOG_ALL.map((entry) => entry.id));
    LOCAL_FEATURED_AUTOMATION_IDS.forEach((id) =>
      expect(ids.has(id)).toBe(true),
    );
  });
});

describe("every card shown creates a real automation", () => {
  // The user-facing promise: if a card is on the page, selecting it creates a
  // scheduled automation rather than dropping the user into a chat. If a
  // package bump adds a chat-only entry, this fails loudly so it gets a local
  // `direct` replacement instead of silently becoming a dead card.
  it("has a direct setup block for every catalog entry", () => {
    const notDirect = AUTOMATION_CATALOG_ALL.filter(
      (entry) => SETUP_REGISTRY.findById(entry.id)?.setup.mode !== "direct",
    ).map((entry) => entry.id);

    expect(notDirect).toEqual([]);
  });
});
