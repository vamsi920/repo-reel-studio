import { describe, expect, it } from "vitest";
import translations from "#/i18n/translation.json";
import { I18nKey } from "#/i18n/declaration";
import { EXTENSIONS_NAV_ITEMS } from "#/components/features/skills/extensions-navigation";

// Milestone 11 review pass: milestone 8 audited the routed-step captions
// against their pages' real empty states and fixed two mismatches (usage,
// knowledge), but only added regression tests for those two — the attach
// and customize steps kept the milestone's manual read as their only
// coverage. This locks both against the real, already-tested UI they
// describe so a future copy or nav change can't silently drift the tour's
// narration out of sync again. Reads translation.json directly (the
// source of truth) because the test environment's i18next mock returns keys
// rather than translated strings — see __tests__/i18n/files-diff-label.test.ts
// for the same pattern.
const en = (key: I18nKey) =>
  (translations as Record<string, Record<string, string>>)[key]?.en;

describe("tutorial caption accuracy", () => {
  it("attach step promises attaching a repository, not picking a local workspace", () => {
    // HomeChatLauncher (src/components/features/home/home-chat-launcher.tsx)
    // hardcodes `<OpenLauncherButton kind="cloud" .../>` — the local-folder
    // picker is deliberately unreachable from this launcher (see the
    // component's own "Workspace/repo are optional" comment plus
    // __tests__/components/features/home/home-chat-launcher.test.tsx's
    // "does not offer a local-folder picker; only GitHub repository
    // selection is reachable" test), so the caption must promise a
    // repository, never a workspace picker that isn't actually there.
    const subtitle = en(I18nKey.TUTORIAL$STEP_ATTACH_SUBTITLE);
    expect(subtitle).toBeDefined();
    expect(subtitle).not.toMatch(/workspace|folder/i);
    expect(subtitle).toMatch(/repository/i);
  });

  it("customize step's skills/plugins/MCP claims each have a real tab in the Customize nav", () => {
    const routes = EXTENSIONS_NAV_ITEMS.map((item) => item.to);
    expect(routes).toEqual(
      expect.arrayContaining(["/mcp", "/skills", "/plugins"]),
    );

    // Customize now has one step per tab (MCP, Skills, Plugins).
    const copy = [
      I18nKey.TUTORIAL$STEP_CUSTOMIZE_SUBTITLE,
      I18nKey.TUTORIAL$STEP_SKILLS_SUBTITLE,
      I18nKey.TUTORIAL$STEP_PLUGINS_SUBTITLE,
    ]
      .map(en)
      .join(" ");
    expect(copy).toMatch(/skills/i);
    expect(copy).toMatch(/plugins/i);
    expect(copy).toMatch(/mcp servers/i);
  });
});
