// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKGROUND_FLAG,
  DEFAULT_BACKGROUND_PREFS,
  launchedInBackground,
  loadBackgroundPrefs,
  saveBackgroundPrefs,
  trayMenuTemplate,
} from "../../electron/background-mode.mjs";

describe("desktop background mode", () => {
  const dirs: string[] = [];
  const tempFile = () => {
    const dir = mkdtempSync(join(tmpdir(), "bg-mode-"));
    dirs.push(dir);
    return join(dir, "nested", "background-mode.json");
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  it("keeps running when closed by default and round-trips saved choices", () => {
    const path = tempFile();
    expect(loadBackgroundPrefs(path)).toEqual(DEFAULT_BACKGROUND_PREFS);
    expect(DEFAULT_BACKGROUND_PREFS.keepRunningWhenClosed).toBe(true);

    const prefs = {
      keepRunningWhenClosed: false,
      openAtLogin: true,
      backgroundNoticeShown: true,
    };
    saveBackgroundPrefs(path, prefs);

    expect(loadBackgroundPrefs(path)).toEqual(prefs);
  });

  it("falls back to the defaults for a corrupt preferences file", () => {
    const path = tempFile();
    saveBackgroundPrefs(path, DEFAULT_BACKGROUND_PREFS);
    writeFileSync(path, "{not json");

    expect(loadBackgroundPrefs(path)).toEqual(DEFAULT_BACKGROUND_PREFS);
  });

  it.each([
    [[`/app/Neo`, BACKGROUND_FLAG], undefined, true],
    [[`/app/Neo`], { wasOpenedAsHidden: true }, true],
    [[`/app/Neo`], { wasOpenedAsHidden: false }, false],
  ])("detects a login-item launch from %j / %j", (argv, loginItem, hidden) => {
    expect(launchedInBackground(argv, loginItem)).toBe(hidden);
  });

  it("reflects the saved choices in the tray menu", () => {
    const menu = trayMenuTemplate({
      ...DEFAULT_BACKGROUND_PREFS,
      openAtLogin: true,
    });

    expect(menu.find((item) => item.id === "openAtLogin")).toMatchObject({
      type: "checkbox",
      checked: true,
    });
    expect(menu.find((item) => item.id === "keepRunning")?.checked).toBe(true);
    expect(menu.at(-1)?.id).toBe("quit");
  });
});
