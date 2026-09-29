import { describe, expect, it } from "vitest";
import translations from "#/i18n/translation.json";
import { I18nKey } from "#/i18n/declaration";
import { EXTENSIONS_NAV_ITEMS } from "#/components/features/skills/extensions-navigation";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";

// Milestone 11 review pass: milestone 8 audited the routed-step captions
// against their pages' real empty states and fixed two mismatches (usage,
// knowledge), but only added regression tests for those two — conversations,
// customize, and settings kept the milestone's manual read as their only
// coverage. This locks all three against the real, already-tested UI they
// describe so a future copy or nav change can't silently drift the tour's
// narration out of sync again. Reads translation.json directly (the
// source of truth) because the test environment's i18next mock returns keys
// rather than translated strings — see __tests__/i18n/files-diff-label.test.ts
// for the same pattern.
const en = (key: I18nKey) =>
  (translations as Record<string, Record<string, string>>)[key]?.en;

describe("tutorial caption accuracy", () => {
  it("conversations step promises attaching a repository, not picking a local workspace", () => {
    // HomeChatLauncher (src/components/features/home/home-chat-launcher.tsx)
    // hardcodes `<OpenLauncherButton kind="cloud" .../>` — the local-folder
    // picker is deliberately unreachable from this launcher (see the
    // component's own "Workspace/repo are optional" comment plus
    // __tests__/components/features/home/home-chat-launcher.test.tsx's
    // "does not offer a local-folder picker; only GitHub repository
    // selection is reachable" test), so the caption must promise a
    // repository, never a workspace picker that isn't actually there.
    const subtitle = en(I18nKey.TUTORIAL$STEP_CONVERSATIONS_SUBTITLE);
    expect(subtitle).toBeDefined();
    expect(subtitle).not.toMatch(/workspace/i);
    expect(subtitle).toMatch(/repository/i);
  });

  it("customize step's skills/plugins/MCP claims each have a real tab in the Customize nav", () => {
    const routes = EXTENSIONS_NAV_ITEMS.map((item) => item.to);
    expect(routes).toEqual(
      expect.arrayContaining(["/mcp", "/skills", "/plugins"]),
    );

    const subtitle = en(I18nKey.TUTORIAL$STEP_CUSTOMIZE_SUBTITLE);
    expect(subtitle).toMatch(/skills/i);
    expect(subtitle).toMatch(/plugins/i);
    expect(subtitle).toMatch(/mcp servers/i);
  });

  it("settings step's model/language/secrets/agent-behavior claims each have a real settings nav destination", () => {
    // model -> LLM page; language -> Application page (LanguageInput lives
    // there, see src/routes/app-settings.tsx and its own test suite);
    // secrets -> Secrets page; agent behavior -> the Agent profile page
    // (agent-context/condenser/verification fold into the same caption
    // phrase, so only the primary Agent destination is asserted here).
    const routes = OSS_NAV_ITEMS.map((item) => item.to);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/settings/llm",
        "/settings/app",
        "/settings/secrets",
        "/settings/agents",
      ]),
    );

    const subtitle = en(I18nKey.TUTORIAL$STEP_SETTINGS_SUBTITLE);
    expect(subtitle).toMatch(/model/i);
    expect(subtitle).toMatch(/language/i);
    expect(subtitle).toMatch(/secrets/i);
  });
});
