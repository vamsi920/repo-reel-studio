import { describe, expect, it } from "vitest";
import {
  LOCAL_AUTOMATION_CATALOG,
  LOCAL_FEATURED_AUTOMATION_IDS,
  SUPERSEDES_PUBLISHED_ID,
} from "#/manifests/local-automation-catalog";
import {
  AUTOMATION_CATALOG_ALL,
  SETUP_REGISTRY,
} from "#/manifests/manifest-sources";
import { validateSetupEntry } from "#/manifests/manifest-validation";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";

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
