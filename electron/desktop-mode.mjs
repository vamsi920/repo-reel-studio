/**
 * Desktop "agent server" modes — the Codex-style split between a thin
 * client for the hosted Neo (remote) and running the whole stack on this
 * computer (local).
 *
 *   remote (default)  The window loads the hosted web app (neo.neodevex.com)
 *                     which already talks to the production agent server.
 *                     Nothing is downloaded or started locally; first launch
 *                     is a sign-in screen, not a Python install log.
 *   local             The bundled uv/node runtimes start the agent server,
 *                     automation backend and static frontend on this
 *                     machine, exactly like `npx @openhands/agent-canvas`.
 *
 * Pure helpers (no Electron import) so main.mjs stays thin and this is
 * unit-testable.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** @typedef {"remote" | "local"} DesktopMode */

export const DESKTOP_MODES = Object.freeze(["remote", "local"]);

export const APPEARANCE_MODES = Object.freeze(["system", "light", "dark"]);

export const DEFAULT_DESKTOP_PREFS = Object.freeze({
  /** @type {DesktopMode} */
  mode: "remote",
  /** ISO timestamp of the last background update check. */
  lastUpdateCheckAt: null,
  /** Light/dark preference for the shell (nativeTheme) and the web app.
   *  Light by default: Neo's own theme (see DEFAULT_APPEARANCE in
   *  src/themes/appearance.ts; keep the two equal). */
  appearance: "light",
});

/** Fallback when config/defaults.json has no `desktop.remoteAppUrl`. */
export const FALLBACK_REMOTE_APP_URL = "https://neo.neodevex.com";

/** Env var that overrides the hosted URL (staging, self-hosted, dev). */
export const REMOTE_URL_ENV = "NEO_DESKTOP_REMOTE_URL";

/** Where the app lands after the splash: the console, never the landing page. */
export const REMOTE_ENTRY_PATH = "/conversations";

/** User-agent token the web app uses to recognise the desktop shell. */
export const DESKTOP_UA_TOKEN = "NeoDesktop";

/** Keep the opening animation on screen at least this long. */
export const MIN_SPLASH_MS = 1900;

/**
 * @param {string} path
 * @returns {{ mode: DesktopMode, lastUpdateCheckAt: string | null, appearance: "system" | "light" | "dark" }}
 */
export function loadDesktopPrefs(path) {
  try {
    if (!existsSync(path)) return { ...DEFAULT_DESKTOP_PREFS };
    const stored = JSON.parse(readFileSync(path, "utf8"));
    return {
      mode: DESKTOP_MODES.includes(stored.mode)
        ? stored.mode
        : DEFAULT_DESKTOP_PREFS.mode,
      lastUpdateCheckAt:
        typeof stored.lastUpdateCheckAt === "string"
          ? stored.lastUpdateCheckAt
          : null,
      appearance: APPEARANCE_MODES.includes(stored.appearance)
        ? stored.appearance
        : DEFAULT_DESKTOP_PREFS.appearance,
    };
  } catch {
    return { ...DEFAULT_DESKTOP_PREFS };
  }
}

/**
 * @param {string} path
 * @param {{ mode: DesktopMode, lastUpdateCheckAt: string | null, appearance?: "system" | "light" | "dark" }} prefs
 */
export function saveDesktopPrefs(path, prefs) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(prefs, null, 2)}\n`);
  } catch {
    // Preferences are a convenience; the default (remote) still works.
  }
}

/**
 * Resolve the hosted app origin: env override, then config/defaults.json,
 * then the built-in fallback. Trailing slashes are dropped; anything that is
 * not an http(s) URL is ignored so a typo cannot make the app load `file:`.
 *
 * @param {{ env?: NodeJS.ProcessEnv, defaults?: { desktop?: { remoteAppUrl?: string } } }} [options]
 * @returns {string}
 */
export function resolveRemoteAppUrl({ env = process.env, defaults } = {}) {
  const candidates = [
    env[REMOTE_URL_ENV],
    defaults?.desktop?.remoteAppUrl,
    FALLBACK_REMOTE_APP_URL,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      return url.origin + url.pathname.replace(/\/+$/, "");
    } catch {
      // try the next candidate
    }
  }
  return FALLBACK_REMOTE_APP_URL;
}

/**
 * The URL the main window opens in remote mode (base + console path).
 * @param {string} base
 * @param {string} [path]
 */
export function remoteEntryUrl(base, path = REMOTE_ENTRY_PATH) {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * True when `url` belongs to the app's own origin (remote host or the
 * local stack), i.e. should stay inside the window rather than open in the
 * system browser.
 * @param {string} url
 * @param {string[]} appOrigins
 */
export function isAppUrl(url, appOrigins) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  return appOrigins.some((o) => {
    try {
      return new URL(o).origin === origin;
    } catch {
      return false;
    }
  });
}

/**
 * Append the desktop token to Chromium's user agent so the web app can tell
 * it is inside the shell (and e.g. skip the marketing landing page).
 * @param {string} baseUserAgent
 * @param {string} version
 */
export function buildDesktopUserAgent(baseUserAgent, version) {
  return `${baseUserAgent} ${DESKTOP_UA_TOKEN}/${version}`;
}

// ── Friendly boot status ──────────────────────────────────────────────────────
//
// The local stack streams hundreds of raw uv/pip/uvicorn lines on first run.
// The splash headline shows a short human phase instead; the raw lines only
// go to the "Show details" console.

const PHASES = Object.freeze({
  download: "Downloading the agent runtime (first run only)…",
  install: "Installing agent components (first run only)…",
  python: "Setting up Python…",
  starting: "Starting the local agent server…",
  automation: "Starting automations…",
});

/**
 * Map one raw service log line to a headline phase, or null when the line
 * says nothing new (the headline keeps its previous text).
 *
 * @param {string} service e.g. "agent-server", "automation"
 * @param {string} line sanitized log line
 * @returns {string | null}
 */
export function friendlyBootStatus(service, line) {
  const text = String(line ?? "");
  if (!text) return null;
  if (
    /cpython|python-build-standalone|Installing Python|Downloading Python/i.test(
      text,
    )
  ) {
    return PHASES.python;
  }
  if (/^Downloaded |^Downloading |Resolved \d+ packages?/i.test(text)) {
    return PHASES.download;
  }
  if (
    /^Installed \d+ packages?|^Installing |Prepared \d+ packages?|Building /i.test(
      text,
    )
  ) {
    return PHASES.install;
  }
  if (
    /Uvicorn running|Application startup complete|Started server process/i.test(
      text,
    )
  ) {
    return service === "automation" ? PHASES.automation : PHASES.starting;
  }
  return null;
}

export const BOOT_PHASES = PHASES;
