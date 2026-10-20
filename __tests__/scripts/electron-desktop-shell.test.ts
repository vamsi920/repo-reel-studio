// @vitest-environment node
// Pure pieces of the desktop shell (menus, context menu, window state,
// injected chrome, deep links). Electron itself is not loaded here; the
// templates are plain data and the helpers are plain functions.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HELP_LINKS,
  MENU_ROUTES,
  buildAppMenuTemplate,
  buildDockMenuTemplate,
  collectMenuIds,
} from "../../electron/app-menu.mjs";
import { buildContextMenuTemplate } from "../../electron/context-menu.mjs";
import {
  TITLEBAR_HEIGHT_PX,
  buildDesktopChromeCss,
  buildNavigateScript,
  deepLinkToPath,
} from "../../electron/renderer-chrome.mjs";
import {
  DEFAULT_WINDOW_STATE,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  loadWindowState,
  sanitizeWindowState,
  saveWindowState,
} from "../../electron/window-state.mjs";

type Item = {
  id?: string;
  label?: string;
  role?: string;
  submenu?: Item[];
  click?: () => void;
  accelerator?: string;
};

function makeActions() {
  return {
    navigate: vi.fn(),
    openExternal: vi.fn(),
    showAbout: vi.fn(),
    showMainWindow: vi.fn(),
    openLogsFolder: vi.fn(),
    copyDiagnostics: vi.fn(),
    toggleSidebar: vi.fn(),
    reloadApp: vi.fn(),
    checkForUpdates: vi.fn(),
    setMode: vi.fn(),
    currentMode: () => "remote" as const,
    setAppearance: vi.fn(),
    currentAppearance: () => "system" as const,
  };
}

function findById(template: Item[], id: string): Item | undefined {
  for (const item of template) {
    if (item.id === id) return item;
    if (item.submenu) {
      const hit = findById(item.submenu, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

describe("application menu", () => {
  it("follows the macOS layout with the app menu first and HIG roles", () => {
    const template = buildAppMenuTemplate({
      platform: "darwin",
      appName: "Neo",
      version: "1.0.0",
      actions: makeActions(),
    }) as Item[];

    expect(template.map((m) => m.label)).toEqual([
      "Neo",
      "File",
      "Edit",
      "View",
      "Go",
      "Window",
      "Help",
    ]);
    const appMenu = template[0].submenu!;
    expect(appMenu.map((i) => i.role ?? i.id)).toEqual(
      expect.arrayContaining(["about", "settings", "services", "hide", "quit"]),
    );
    expect(findById(template, "settings")?.accelerator).toBe("CmdOrCtrl+,");
    expect(findById(template, "new-conversation")?.accelerator).toBe(
      "CmdOrCtrl+N",
    );
  });

  it("folds the app menu into File/Help on Windows and Linux", () => {
    const template = buildAppMenuTemplate({
      platform: "win32",
      appName: "Neo",
      version: "1.0.0",
      actions: makeActions(),
    }) as Item[];

    expect(template[0].label).toBe("File");
    expect(findById(template[0].submenu!, "settings")).toBeDefined();
    expect(findById(template.at(-1)!.submenu!, "about")?.label).toBe(
      "About Neo 1.0.0",
    );
  });

  it("routes every navigation item to its in-app path", () => {
    const actions = makeActions();
    const template = buildAppMenuTemplate({
      platform: "darwin",
      appName: "Neo",
      version: "1.0.0",
      actions,
    }) as Item[];

    findById(template, "new-conversation")!.click!();
    findById(template, "go-automations")!.click!();
    findById(template, "settings")!.click!();
    findById(template, "help-issue")!.click!();
    findById(template, "toggle-sidebar")!.click!();

    expect(actions.navigate.mock.calls.map((c) => c[0])).toEqual([
      MENU_ROUTES.newConversation,
      MENU_ROUTES.automations,
      MENU_ROUTES.settings,
    ]);
    expect(actions.openExternal).toHaveBeenCalledWith(HELP_LINKS.reportIssue);
    expect(actions.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("hides Force Reload in packaged builds and keeps DevTools", () => {
    const packaged = buildAppMenuTemplate({
      platform: "darwin",
      appName: "Neo",
      version: "1",
      actions: makeActions(),
      isPackaged: true,
    }) as Item[];
    const view = packaged.find((m) => m.label === "View")!.submenu!;
    expect(view.some((i) => i.role === "forceReload")).toBe(false);
    expect(view.some((i) => i.role === "toggleDevTools")).toBe(true);
  });

  it("gives the dock menu the three everyday actions", () => {
    const actions = makeActions();
    const dock = buildDockMenuTemplate(actions) as Item[];
    expect(collectMenuIds(dock)).toEqual([
      "new-conversation",
      "automations",
      "settings",
    ]);
    dock[0].click!();
    expect(actions.navigate).toHaveBeenCalledWith(MENU_ROUTES.newConversation);
  });
});

describe("context menu", () => {
  const actions = () => ({
    openExternal: vi.fn(),
    copyText: vi.fn(),
    copyImage: vi.fn(),
    replaceMisspelling: vi.fn(),
    addToDictionary: vi.fn(),
    inspectElement: vi.fn(),
    reload: vi.fn(),
  });
  const base = {
    x: 1,
    y: 2,
    isEditable: false,
    selectionText: "",
    linkURL: "",
    srcURL: "",
    mediaType: "none",
    misspelledWord: "",
    dictionarySuggestions: [] as string[],
    editFlags: {
      canUndo: true,
      canRedo: false,
      canCut: true,
      canCopy: true,
      canPaste: true,
    },
  };

  it("offers spelling fixes, then edit actions, inside an editable field", () => {
    const a = actions();
    const template = buildContextMenuTemplate(
      {
        ...base,
        isEditable: true,
        misspelledWord: "teh",
        dictionarySuggestions: ["the", "tea"],
      } as never,
      a,
    ) as Item[];

    expect(collectMenuIds(template as never).slice(0, 3)).toEqual([
      "spelling:the",
      "spelling:tea",
      "spelling-add",
    ]);
    expect(collectMenuIds(template as never)).toEqual(
      expect.arrayContaining(["cut", "copy", "paste", "select-all"]),
    );
    findById(template, "spelling:the")!.click!();
    expect(a.replaceMisspelling).toHaveBeenCalledWith("the");
    expect(findById(template, "redo")).toMatchObject({ enabled: false });
  });

  it("offers link actions for http(s) links only and reload on blank areas", () => {
    const a = actions();
    const link = buildContextMenuTemplate(
      { ...base, linkURL: "https://example.com/x" } as never,
      a,
    ) as Item[];
    expect(collectMenuIds(link as never)).toEqual(["open-link", "copy-link"]);
    findById(link, "open-link")!.click!();
    expect(a.openExternal).toHaveBeenCalledWith("https://example.com/x");

    const js = buildContextMenuTemplate(
      { ...base, linkURL: "javascript:alert(1)" } as never,
      a,
    ) as Item[];
    expect(collectMenuIds(js as never)).toEqual(["reload"]);
  });

  it("adds Inspect Element only outside packaged builds", () => {
    const a = actions();
    const dev = buildContextMenuTemplate(base as never, a, {
      isPackaged: false,
    });
    const prod = buildContextMenuTemplate(base as never, a, {
      isPackaged: true,
    });
    expect(collectMenuIds(dev as never)).toContain("inspect");
    expect(collectMenuIds(prod as never)).not.toContain("inspect");
  });
});

describe("window state", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const display = { x: 0, y: 0, width: 1920, height: 1080 };

  it("keeps a position that is still on a display and drops one that is not", () => {
    const on = sanitizeWindowState(
      { x: 100, y: 50, width: 1200, height: 800, maximized: true },
      [display],
    );
    expect(on).toEqual({
      x: 100,
      y: 50,
      width: 1200,
      height: 800,
      maximized: true,
    });

    const off = sanitizeWindowState(
      { x: 5000, y: 50, width: 1200, height: 800 },
      [display],
    );
    expect(off).toEqual({ width: 1200, height: 800, maximized: false });
  });

  it("clamps sizes to the window minimum and ignores garbage", () => {
    expect(sanitizeWindowState({ width: 10, height: "x" }, [display])).toEqual({
      width: MIN_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_STATE.height,
      maximized: false,
    });
    expect(sanitizeWindowState("nope", [display])).toEqual(
      DEFAULT_WINDOW_STATE,
    );
    expect(MIN_WINDOW_HEIGHT).toBeLessThanOrEqual(DEFAULT_WINDOW_STATE.height);
  });

  it("round-trips through disk and falls back to defaults when missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "neo-window-state-"));
    dirs.push(dir);
    const path = join(dir, "nested", "window-state.json");

    expect(loadWindowState(path, [display])).toEqual(DEFAULT_WINDOW_STATE);
    saveWindowState(path, {
      x: 10,
      y: 20,
      width: 900,
      height: 700,
      maximized: false,
    });
    expect(loadWindowState(path, [display])).toEqual({
      x: 10,
      y: 20,
      width: 900,
      height: 700,
      maximized: false,
    });
  });
});

describe("renderer chrome", () => {
  it("pads and drag-enables the sidebar on macOS only", () => {
    const mac = buildDesktopChromeCss({ platform: "darwin" });
    expect(mac).toContain(`padding-top: ${TITLEBAR_HEIGHT_PX}px`);
    expect(mac).toContain("-webkit-app-region: drag");
    expect(mac).toContain("-webkit-app-region: no-drag");

    const win = buildDesktopChromeCss({ platform: "win32" });
    expect(win).not.toContain("-webkit-app-region");
  });

  it("builds a pushState navigation that never reloads the page", () => {
    const script = buildNavigateScript("/settings");
    expect(script).toContain('history.pushState({},"",p)');
    expect(script).toContain('var p="/settings"');
    expect(script).toContain("popstate");
    expect(script).not.toContain("location.assign");
    expect(script).not.toContain("location.href");
  });

  it.each([
    ["neo://open", "/conversations"],
    ["neo://open/settings/llm", "/settings/llm"],
    ["neo://conversations/abc-123", "/conversations/abc-123"],
    ["neo://open/automations?tab=runs", "/automations?tab=runs"],
    ["https://evil.example/", null],
    ["neo://open/<script>", null],
    ["not a url", null],
  ])("maps deep link %s to %s", (url, expected) => {
    expect(deepLinkToPath(url)).toBe(expected);
  });
});
