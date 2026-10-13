/**
 * Keeps the desktop app's stack running after its window closes, so
 * scheduled, GitHub and webhook automations keep firing.
 *
 * Benchmarked against Devin (case-studies/automations, round 4): Devin's
 * automations run in its cloud whether or not anyone has it open. A local
 * install only runs them while the stack is up, and the desktop app used to
 * quit -- taking the scheduler, the GitHub event bridge and the automation
 * guard with it -- the moment its window closed. Now closing the window
 * leaves a tray / menu-bar icon behind, and "Open at login" starts the stack
 * hidden when the user signs in.
 *
 * The preferences file and the menu template are plain functions so they
 * can be tested without Electron.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Command-line flag the login item launches the app with. */
export const BACKGROUND_FLAG = "--background";

export const DEFAULT_BACKGROUND_PREFS = Object.freeze({
  keepRunningWhenClosed: true,
  openAtLogin: false,
  backgroundNoticeShown: false,
});

/** @typedef {{ keepRunningWhenClosed: boolean, openAtLogin: boolean, backgroundNoticeShown: boolean }} BackgroundPrefs */

/**
 * @param {string} path
 * @returns {BackgroundPrefs}
 */
export function loadBackgroundPrefs(path) {
  try {
    if (!existsSync(path)) return { ...DEFAULT_BACKGROUND_PREFS };
    const stored = JSON.parse(readFileSync(path, "utf8"));
    return {
      keepRunningWhenClosed:
        typeof stored.keepRunningWhenClosed === "boolean"
          ? stored.keepRunningWhenClosed
          : DEFAULT_BACKGROUND_PREFS.keepRunningWhenClosed,
      openAtLogin: stored.openAtLogin === true,
      backgroundNoticeShown: stored.backgroundNoticeShown === true,
    };
  } catch {
    return { ...DEFAULT_BACKGROUND_PREFS };
  }
}

/**
 * @param {string} path
 * @param {BackgroundPrefs} prefs
 */
export function saveBackgroundPrefs(path, prefs) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(prefs, null, 2)}\n`);
  } catch {
    // Preferences are a convenience; the defaults still work.
  }
}

/**
 * True when the app was started by its login item, so it should start the
 * stack without opening a window.
 *
 * @param {string[]} argv
 * @param {{ wasOpenedAsHidden?: boolean }} [loginItem]
 */
export function launchedInBackground(argv, loginItem) {
  return (
    argv.includes(BACKGROUND_FLAG) || loginItem?.wasOpenedAsHidden === true
  );
}

/**
 * Tray menu template (Electron MenuItemConstructorOptions without the
 * functions, which `setupBackgroundMode` attaches by id).
 *
 * @param {BackgroundPrefs} prefs
 */
export function trayMenuTemplate(prefs) {
  return [
    { id: "open", label: "Open Neo" },
    {
      id: "status",
      label: "Automations keep running while Neo is in the background",
      enabled: false,
    },
    { type: "separator" },
    {
      id: "keepRunning",
      label: "Keep running when the window is closed",
      type: "checkbox",
      checked: prefs.keepRunningWhenClosed,
    },
    {
      id: "openAtLogin",
      label: "Open at login",
      type: "checkbox",
      checked: prefs.openAtLogin,
    },
    { type: "separator" },
    { id: "quit", label: "Quit Neo" },
  ];
}

/**
 * Wire the tray, the login item and the close behaviour.
 *
 * @param {{
 *   app: import("electron").App,
 *   Tray: typeof import("electron").Tray,
 *   Menu: typeof import("electron").Menu,
 *   Notification: typeof import("electron").Notification,
 *   nativeImage: typeof import("electron").nativeImage,
 *   iconPath: string,
 *   prefsPath: string,
 *   openWindow: () => void,
 * }} options
 */
export function setupBackgroundMode({
  app,
  Tray,
  Menu,
  Notification,
  nativeImage,
  iconPath,
  prefsPath,
  openWindow,
}) {
  let prefs = loadBackgroundPrefs(prefsPath);
  /** @type {import("electron").Tray | null} */
  let tray = null;

  const applyLoginItem = () => {
    try {
      app.setLoginItemSettings({
        openAtLogin: prefs.openAtLogin,
        openAsHidden: true,
        args: [BACKGROUND_FLAG],
      });
    } catch (error) {
      console.warn("[desktop] Could not update the login item:", error);
    }
  };

  const update = (patch) => {
    prefs = { ...prefs, ...patch };
    saveBackgroundPrefs(prefsPath, prefs);
    renderMenu();
  };

  const actions = {
    open: () => openWindow(),
    keepRunning: (item) => update({ keepRunningWhenClosed: item.checked }),
    openAtLogin: (item) => {
      update({ openAtLogin: item.checked });
      applyLoginItem();
    },
    quit: () => app.quit(),
  };

  function renderMenu() {
    if (!tray) return;
    const template = trayMenuTemplate(prefs).map((item) =>
      item.id && actions[item.id] ? { ...item, click: actions[item.id] } : item,
    );
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  try {
    const image = nativeImage
      .createFromPath(iconPath)
      .resize({ width: 18, height: 18 });
    tray = new Tray(image);
    tray.setToolTip("Neo");
    // Windows and most Linux trays open the app on a plain click; macOS
    // shows the menu instead.
    if (process.platform !== "darwin") tray.on("click", () => openWindow());
    renderMenu();
    console.log(
      `[desktop] Tray ready; keep running when closed: ${prefs.keepRunningWhenClosed}, open at login: ${prefs.openAtLogin}`,
    );
  } catch (error) {
    // No system tray (some Linux desktops): fall back to quitting on close,
    // or the app would keep running with no way to reach it.
    console.warn("[desktop] No system tray available:", error);
    tray = null;
  }
  // Keep the OS login item in line with the stored preference.
  if (prefs.openAtLogin) applyLoginItem();

  return {
    /** Called on window-all-closed: true when the app should keep running. */
    shouldStayInBackground() {
      if (!tray || !prefs.keepRunningWhenClosed) return false;
      if (!prefs.backgroundNoticeShown) {
        try {
          new Notification({
            title: "Neo is still running",
            body: "Automations keep running in the background. Quit from the Neo icon in the menu bar or system tray.",
          }).show();
        } catch {
          // Notifications unsupported; the tray icon still explains itself.
        }
        update({ backgroundNoticeShown: true });
      }
      return true;
    },
  };
}
