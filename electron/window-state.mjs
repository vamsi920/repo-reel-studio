/**
 * Remember the main window's size, position and maximized state between
 * launches, the way native Mac apps do, instead of always opening maximized.
 *
 * Pure helpers (no Electron import) so they can be unit-tested; main.mjs
 * wires them to BrowserWindow events and `screen.getAllDisplays()`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** @typedef {{ x?: number, y?: number, width: number, height: number, maximized: boolean }} WindowState */
/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */

export const DEFAULT_WINDOW_STATE = Object.freeze({
  width: 1440,
  height: 900,
  maximized: false,
});

export const MIN_WINDOW_WIDTH = 800;
export const MIN_WINDOW_HEIGHT = 600;

/** Minimum number of pixels of the window that must stay on some display. */
const VISIBLE_MARGIN = 80;

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Validate a stored state against the currently attached displays. A window
 * that was last seen on a monitor that is now unplugged is re-centred by
 * dropping its x/y (Electron centres windows without a position).
 *
 * @param {unknown} raw
 * @param {Rect[]} displays work areas, from screen.getAllDisplays()
 * @param {WindowState} [fallback]
 * @returns {WindowState}
 */
export function sanitizeWindowState(
  raw,
  displays,
  fallback = DEFAULT_WINDOW_STATE,
) {
  const base = { ...fallback };
  if (!raw || typeof raw !== "object") return base;
  const s = /** @type {Record<string, unknown>} */ (raw);

  const width = isFiniteNumber(s.width)
    ? Math.max(MIN_WINDOW_WIDTH, Math.round(s.width))
    : base.width;
  const height = isFiniteNumber(s.height)
    ? Math.max(MIN_WINDOW_HEIGHT, Math.round(s.height))
    : base.height;
  const maximized = s.maximized === true;

  const result = { width, height, maximized };

  if (isFiniteNumber(s.x) && isFiniteNumber(s.y)) {
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    const visible = (displays ?? []).some(
      (d) =>
        x + width - VISIBLE_MARGIN > d.x &&
        x + VISIBLE_MARGIN < d.x + d.width &&
        y + VISIBLE_MARGIN > d.y &&
        y + VISIBLE_MARGIN < d.y + d.height,
    );
    if (visible) {
      result.x = x;
      result.y = y;
    }
  }
  return result;
}

/**
 * @param {string} path
 * @param {Rect[]} displays
 * @returns {WindowState}
 */
export function loadWindowState(path, displays) {
  try {
    if (!existsSync(path)) return { ...DEFAULT_WINDOW_STATE };
    return sanitizeWindowState(
      JSON.parse(readFileSync(path, "utf8")),
      displays,
    );
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

/**
 * @param {string} path
 * @param {WindowState} state
 */
export function saveWindowState(path, state) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    // Window state is a convenience; losing it just means the default size.
  }
}

/**
 * Track a BrowserWindow and persist its bounds (debounced) on every
 * resize/move, plus a final write on close. Returns a dispose function.
 *
 * @param {import("electron").BrowserWindow} win
 * @param {string} path
 * @param {{ debounceMs?: number }} [options]
 */
export function trackWindowState(win, path, { debounceMs = 400 } = {}) {
  let timer = null;

  const snapshot = () => {
    if (win.isDestroyed()) return null;
    const maximized = win.isMaximized() || win.isFullScreen();
    // While maximized the normal bounds are what we want to restore to.
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    return { ...bounds, maximized };
  };

  const write = () => {
    const state = snapshot();
    if (state) saveWindowState(path, state);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(write, debounceMs);
    if (timer.unref) timer.unref();
  };

  for (const evt of ["resize", "move", "maximize", "unmaximize"]) {
    win.on(evt, schedule);
  }
  win.on("close", () => {
    clearTimeout(timer);
    write();
  });

  return () => {
    clearTimeout(timer);
    for (const evt of ["resize", "move", "maximize", "unmaximize"]) {
      win.removeListener(evt, schedule);
    }
  };
}
