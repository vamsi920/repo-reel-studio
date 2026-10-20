/**
 * Electron Main Process — Agent Canvas Desktop
 *
 * Starts the full Agent Canvas stack (agent-server + automation via uvx,
 * static frontend, ingress proxy), then opens a native BrowserWindow once
 * the ingress is ready. Shows a loading screen while backends start.
 *
 * Path layout (electron-builder uses directories.app: 'electron'):
 *
 *   Packaged (macOS example):
 *     Contents/Resources/app/     ← __dirname (main.mjs lives here)
 *       main.mjs
 *       loading.html
 *       scripts/                  ← copied from repo scripts/
 *       config/                   ← copied from repo config/
 *       build/                    ← static frontend
 *     Contents/Resources/bin/     ← process.resourcesPath/bin
 *       uv  uvx                   ← bundled via extraResources
 *
 *   Dev (npm run desktop  →  electron electron):
 *     electron/main.mjs           ← __dirname = <repo>/electron/
 *     scripts/ config/ build/     ← one level up: <repo>/
 *     system uvx from PATH
 *
 * When packaged, scripts/config/build are siblings of main.mjs so
 * projectRoot === __dirname. In dev they are one level up.
 *
 * The dev command points electron at the electron/ DIRECTORY, not at
 * main.mjs directly. Electron's default_app only reads name/productName/
 * version out of <arg>/package.json, so passing the file makes it look for
 * electron/main.mjs/package.json, miss, and leave app.name at the host
 * bundle's default — "Electron" in the menu bar and userData path.
 */

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  screen,
  shell,
  Tray,
} from "electron";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  launchedInBackground,
  setupBackgroundMode,
} from "./background-mode.mjs";
import { buildAppMenuTemplate, buildDockMenuTemplate } from "./app-menu.mjs";
import { buildContextMenuTemplate } from "./context-menu.mjs";
import {
  TOGGLE_SIDEBAR_SCRIPT,
  buildDesktopChromeCss,
  buildNavigateScript,
  deepLinkToPath,
} from "./renderer-chrome.mjs";
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  loadWindowState,
  trackWindowState,
} from "./window-state.mjs";
import {
  MIN_SPLASH_MS,
  buildDesktopUserAgent,
  friendlyBootStatus,
  isAppUrl,
  loadDesktopPrefs,
  remoteEntryUrl,
  resolveRemoteAppUrl,
  saveDesktopPrefs,
} from "./desktop-mode.mjs";
import {
  fetchLatestRelease,
  isNewerVersion,
  isUpdateCheckDue,
  pickReleaseAsset,
} from "./updates.mjs";

const APP_NAME = "Neo";
/** The bundled local stack's ingress (local mode). */
const LOCAL_APP_URL = "http://localhost:8000";
/** Custom URL scheme: `neo://open/settings` focuses the app and navigates. */
const DEEP_LINK_PROTOCOL = "neo";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Path resolution ───────────────────────────────────────────────────────────
// Packaged (directories.app: 'electron'): scripts/config/build are SIBLINGS of
// main.mjs inside Resources/app/, so projectRoot === __dirname.
// Dev (electron electron): those directories are one level UP in the
// repo root, so projectRoot === join(__dirname, '..').
// Both branches key off __dirname (always <repo>/electron in dev), not
// app.getAppPath(), so the entry-point form doesn't affect them.

const projectRoot = app.isPackaged ? __dirname : join(__dirname, "..");
const buildDir = join(projectRoot, "build");
const scriptsDir = join(projectRoot, "scripts");

/** config/defaults.json (desktop.remoteAppUrl, desktop.githubRepo, …). */
let defaults = {};
try {
  defaults = JSON.parse(
    readFileSync(join(projectRoot, "config", "defaults.json"), "utf8"),
  );
} catch {
  // Missing config: the fallbacks in desktop-mode.mjs apply.
}

// ── Agent-server mode (remote = hosted Neo, local = bundled stack) ───────────
//
// Remote is the default: the window loads the hosted web app, which already
// talks to the production agent server — nothing is installed or started on
// this machine, and first launch is a sign-in screen. Local mode (opt-in from
// the Neo ▸ Agent Server menu) boots the bundled uv/node stack as before.

function desktopPrefsPath() {
  return join(app.getPath("userData"), "desktop-mode.json");
}
/** @type {{ mode: "remote" | "local", lastUpdateCheckAt: string | null }} */
let desktopPrefs = { mode: "remote", lastUpdateCheckAt: null };
const REMOTE_APP_URL = resolveRemoteAppUrl({ defaults });
const GITHUB_REPO =
  defaults?.desktop?.githubRepo ?? "vamsi920/repo-reel-studio";

function isLocalMode() {
  return desktopPrefs.mode === "local";
}

/** URL the main window opens for the current mode. */
function appEntryUrl() {
  return isLocalMode() ? LOCAL_APP_URL : remoteEntryUrl(REMOTE_APP_URL);
}

/** Origins that stay inside the window; everything else opens in the browser. */
function appOrigins() {
  return [REMOTE_APP_URL, LOCAL_APP_URL, "http://127.0.0.1:8000"];
}

/** Persist a mode change and relaunch into it (the local stack must be torn down / brought up). */
function switchDesktopMode(mode) {
  if (mode === desktopPrefs.mode) return;
  desktopPrefs = { ...desktopPrefs, mode };
  saveDesktopPrefs(desktopPrefsPath(), desktopPrefs);
  app.relaunch();
  app.quit();
}

// Neo app icon, used as the BrowserWindow.icon option.
// Windows gets the multi-size icon.ico (16→256, small sizes as classic BMP
// entries — the Windows shell needs those); Linux uses the 1024×1024 PNG
// for its taskbar. On macOS the dock icon comes from the .app bundle's
// icon.icns, so this path is unused there. Both files live next to main.mjs
// in dev and are copied into Resources/app/build-resources/ via the
// `files:` array. Regenerate with `npm run generate-icons`.
const appIconPath = join(
  __dirname,
  "build-resources",
  process.platform === "win32" ? "icon.ico" : "icon.png",
);

// macOS menu-bar icon: a monochrome "template" image (black + alpha) that
// the system tints for light/dark menu bars and the pressed state. The
// `Template` suffix makes Electron mark it as such; the @2x sibling is
// picked up automatically for Retina. Other platforms keep the colour icon.
const trayIconPath =
  process.platform === "darwin"
    ? join(__dirname, "build-resources", "trayTemplate.png")
    : appIconPath;

// electron-builder's NSIS shortcuts are stamped with AppUserModelId
// ${APP_ID} (WinShell::SetLnkAUMI in installer.nsh). Declare the same id so
// running/pinned taskbar entries group with the shortcut and inherit its
// icon. Must match appId in electron-builder.config.mjs, and must be set
// before any BrowserWindow is created.
if (process.platform === "win32") {
  app.setAppUserModelId("dev.neodevex.agent-canvas");
}

// ── Bundled uv ────────────────────────────────────────────────────────────────

/**
 * Inject the bundled uv binary into PATH so that uvx calls inside
 * dev-with-automation.mjs resolve to our bundled binary.
 * No-op in dev mode (falls back to system uv).
 */
function injectBundledUv() {
  if (!app.isPackaged) return;

  const isWin = process.platform === "win32";
  const uvName = isWin ? "uv.exe" : "uv";
  const uvxName = isWin ? "uvx.exe" : "uvx";
  const binDir = join(process.resourcesPath, "bin");
  const uvPath = join(binDir, uvName);

  // We only probe for `uv` here — `uv` and `uvx` ship together in the
  // bundle (`download-uv.mjs` writes both), so if `uv` is present we
  // assume `uvx` is too. `uvxAvailable()` is called separately by
  // start-up code to confirm the resolved binary actually runs.
  if (!existsSync(uvPath)) {
    console.warn("[desktop] Bundled uv not found at", uvPath);
    return;
  }

  // electron-builder copies files without preserving the +x bit on Unix.
  if (!isWin) {
    try {
      chmodSync(uvPath, 0o755);
      const uvxPath = join(binDir, uvxName);
      if (existsSync(uvxPath)) chmodSync(uvxPath, 0o755);
    } catch {}
  }

  const sep = isWin ? ";" : ":";
  process.env.PATH = `${binDir}${sep}${process.env.PATH ?? ""}`;
  console.log("[desktop] Injected bundled uv from", binDir);
}

/**
 * Verify uvx is reachable (either bundled or system).
 * Returns true/false — callers show a dialog on false.
 */
function uvxAvailable() {
  const cmd = process.platform === "win32" ? "uvx.exe" : "uvx";
  const r = spawnSync(cmd, ["--version"], { stdio: "pipe" });
  return r.status === 0;
}

/**
 * Inject the bundled Node.js distribution into PATH so subsequent spawns
 * can find `node`, `npm`, and `npx`.
 *
 * When the app runs as a packaged .app on macOS, the system PATH is minimal
 * (/usr/bin:/bin only) — Homebrew, nvm, asdf etc. installs of Node are
 * invisible. Two breakages flow from that:
 *
 *   1. The dev-with-automation.mjs stack spawns `node scripts/ingress.mjs`
 *      and `node scripts/static-server.mjs`; if `node` is not found those
 *      processes fail silently and port 8000 never responds.
 *   2. Most stdio MCP marketplace entries (Slack, GitHub, Figma, etc.)
 *      use `command: "npx"`. When the agent-server tries to spawn one the
 *      missing `npx` makes the spawn fail with ENOENT; the SDK reports it
 *      as an `error_kind: "connection"` MCP test failure, surfaced in the
 *      install modal as "Could not reach the server".
 *
 * We tried bridging via Electron-as-Node (ELECTRON_RUN_AS_NODE=1) wrappers
 * first. That fixed the ENOENT but introduced a new failure: stdio MCP
 * servers spawned through the wrapper exited with "McpError: Connection
 * closed" before the JSON-RPC handshake completed. Electron-as-Node is
 * fine for our networking helper scripts but its stdin/stdout semantics
 * differ enough from a vanilla `node` binary that stdio JSON-RPC servers
 * are not reliable under it. The robust fix is to ship a real Node.js
 * runtime as an extraResource (see scripts/download-node.mjs and the
 * `resources/node/` entry in electron-builder.config.mjs) and just put
 * its bin dir on PATH.
 *
 * No-op in dev mode (`npm run desktop`): the user's terminal PATH already
 * has Node tooling and `app.isPackaged` is false. If the bundled dir is
 * somehow missing (e.g. the download step was skipped during packaging),
 * we log a loud warning and leave PATH untouched so the failure mode is
 * obvious in the console rather than confusing downstream.
 */
function injectBundledNode() {
  if (!app.isPackaged) return;

  const isWin = process.platform === "win32";
  const nodeRoot = join(process.resourcesPath, "node");
  // POSIX Node distributions put binaries in bin/; Windows zips put node.exe
  // and the npm.cmd / npx.cmd wrappers at the distribution root.
  const binDir = isWin ? nodeRoot : join(nodeRoot, "bin");
  const nodeExe = isWin ? join(nodeRoot, "node.exe") : join(binDir, "node");

  if (!existsSync(nodeExe)) {
    console.warn(
      `[desktop] Bundled Node.js not found at ${nodeExe} — backend ` +
        "scripts and stdio MCP servers will fail. Run `npm run download-node` " +
        "and rebuild.",
    );
    return;
  }

  // electron-builder doesn't always preserve the +x bit on POSIX. node, npm,
  // and npx need to be executable for shell PATH lookup to consider them.
  if (!isWin) {
    const required = ["node", "npm", "npx"];
    for (const name of required) {
      const p = join(binDir, name);
      try {
        if (existsSync(p)) chmodSync(p, 0o755);
      } catch {
        // best-effort: a stale read-only mount or test fixture is fine to skip
      }
    }
  }

  const sep = isWin ? ";" : ":";
  process.env.PATH = `${binDir}${sep}${process.env.PATH ?? ""}`;
  console.log("[desktop] Injected bundled Node from", binDir);
}

// ── Readiness polling ─────────────────────────────────────────────────────────

/**
 * Wait until `url` responds at all (status < 500). Used to confirm the
 * ingress proxy is bound — not a guarantee that the agent-server behind it
 * is ready. Use {@link waitForAgentServer} for that.
 */
async function waitForUrl(url, timeoutMs = 120_000, intervalMs = 600) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${url} to become ready (${timeoutMs / 1000}s).`,
  );
}

/**
 * Wait until `url` returns HTTP 200 — meaning the agent-server itself is
 * serving requests, not just that the ingress proxy is up.
 *
 * On first launch, `uvx` has to download a Python toolchain and install
 * `openhands-agent-server` and its workspace deps from PyPI, which can
 * easily take a few minutes on a slow network. We poll the route end-to-end
 * (through ingress on port 8000, so a missing or restarted ingress is also
 * caught) instead of just probing the static-server fallback that
 * `waitForUrl` would accept.
 */
async function waitForAgentServer(
  url = "http://localhost:8000/server_info",
  timeoutMs = 10 * 60_000,
  intervalMs = 1_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      // Only 200 is success here. 502 from ingress means the upstream agent
      // server isn't bound yet; 401 means auth is required and the bundled
      // key didn't reach us — we still treat that as "the agent server is
      // up", because the proxy got a real HTTP response from it.
      if (res.status === 200 || res.status === 401) return;
    } catch {
      // Transient network / DNS / timeout — keep polling until the deadline.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Agent server at ${url} never came up (${Math.round(timeoutMs / 1000)}s). ` +
      "Check the terminal log for errors from uvx / the agent-server process.",
  );
}

// ── Windows ───────────────────────────────────────────────────────────────────

let loadingWin = null;
let mainWin = null;

// Collapsed splash size — loading.html's .container height must match. The
// expanded height reveals the startup-log console below it ("Show details").
const LOADING_WIN_WIDTH = 480;
const LOADING_WIN_HEIGHT = 380;
const LOADING_WIN_EXPANDED_HEIGHT = 600;

// Where the macOS traffic lights sit when the title bar is hidden; the
// injected sidebar padding (renderer-chrome.mjs TITLEBAR_HEIGHT_PX) clears it.
const TRAFFIC_LIGHT_POSITION = { x: 14, y: 13 };

/**
 * Grow or shrink the loading window to reveal/hide the startup-log console.
 * Keeps the top edge fixed so the splash content doesn't jump. Invoked from
 * the renderer ("Show details" toggle) and from showStartupFailure().
 */
function setLoadingWindowExpanded(expanded) {
  if (!loadingWin || loadingWin.isDestroyed()) return;
  const bounds = loadingWin.getBounds();
  const height = expanded ? LOADING_WIN_EXPANDED_HEIGHT : LOADING_WIN_HEIGHT;
  if (bounds.height === height) return;
  // macOS ignores programmatic resizes of resizable:false windows on some
  // Electron versions — lift the flag around the change.
  loadingWin.setResizable(true);
  loadingWin.setBounds({ ...bounds, height }, true);
  loadingWin.setResizable(false);
}

function createLoadingWindow() {
  loadingWin = new BrowserWindow({
    width: LOADING_WIN_WIDTH,
    // Tall enough to fit the streaming status line + the "first launch can
    // take a few minutes" hint without scrollbars.
    height: LOADING_WIN_HEIGHT,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    // Pre-paint window color; must match --oh-background in loading.html.
    backgroundColor: "#0b0e14",
    icon: appIconPath,
    // Frameless + roundedCorners gives the macOS 11+ splash shape; the
    // system drop shadow stays on.
    roundedCorners: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Bridges the startup-log console over IPC (see preload.cjs).
      preload: join(__dirname, "preload.cjs"),
      // Read by preload.cjs so the splash can print the app version.
      additionalArguments: [
        `--neo-app-version=${app.getVersion()}`,
        `--neo-desktop-mode=${desktopPrefs.mode}`,
      ],
    },
  });

  // The renderer can only receive IPC once the page has loaded — replay the
  // lines buffered until now, then stream live batches (see appendBootLog).
  loadingWin.webContents.on("did-finish-load", () => {
    if (!loadingWin || loadingWin.isDestroyed()) return;
    clearTimeout(bootLogFlushTimer);
    bootLogFlushTimer = null;
    bootLogPending = [];
    if (bootLog.length) {
      loadingWin.webContents.send("boot-log:batch", bootLog.slice());
    }
    bootLogReady = true;
    if (fatalSummary) {
      loadingWin.webContents.send("boot-log:fatal", fatalSummary);
    }
  });

  loadingWin.loadFile(join(__dirname, "loading.html"));
  loadingWin.once("ready-to-show", () => loadingWin?.show());
}

/** Persisted main-window bounds live next to the background-mode prefs. */
function windowStatePath() {
  return join(app.getPath("userData"), "window-state.json");
}

/**
 * Reveal a window with a short opacity fade (macOS/Windows honour
 * setOpacity; Linux ignores it, so the window just appears). Keeps the
 * splash → app hand-off from feeling like a hard cut.
 */
function fadeInWindow(win, durationMs = 220) {
  if (!win || win.isDestroyed()) return;
  const supportsOpacity = process.platform !== "linux";
  if (!supportsOpacity) {
    win.show();
    return;
  }
  win.setOpacity(0);
  win.show();
  const steps = 12;
  let i = 0;
  const tick = () => {
    if (!win || win.isDestroyed()) return;
    i += 1;
    const t = Math.min(1, i / steps);
    // ease-out
    win.setOpacity(1 - (1 - t) * (1 - t));
    if (t < 1) setTimeout(tick, durationMs / steps);
  };
  setTimeout(tick, 0);
}

/** Run an in-app navigation in the main window, opening it first if needed. */
function navigateMainWindow(path) {
  showMainWindow();
  if (!mainWin || mainWin.isDestroyed()) return;
  const run = () =>
    mainWin?.webContents
      .executeJavaScript(buildNavigateScript(path), true)
      .catch(() => {});
  if (mainWin.webContents.isLoading()) {
    mainWin.webContents.once("did-finish-load", run);
  } else {
    run();
  }
}

function createMainWindow() {
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const state = loadWindowState(windowStatePath(), displays);

  mainWin = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    title: APP_NAME,
    // App-shell background (--oh-background in src/index.css) — avoids white
    // flashes while the first paint happens behind the splash.
    backgroundColor: "#0b0e14",
    // Native-looking chrome: no title bar, traffic lights inset over the
    // sidebar (which renderer-chrome.mjs pads and makes draggable).
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition:
      process.platform === "darwin" ? TRAFFIC_LIGHT_POSITION : undefined,
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
  });

  // The web app only ever sees the desktop CSS, never the other way round.
  const chromeCss = buildDesktopChromeCss({ platform: process.platform });
  mainWin.webContents.on("did-finish-load", () => {
    mainWin?.webContents.insertCSS(chromeCss).catch(() => {});
  });

  // Keep the OS window title stable — the SPA swaps document.title per route.
  mainWin.on("page-title-updated", (event) => event.preventDefault());

  // Native right-click menu (Electron ships none).
  mainWin.webContents.on("context-menu", (_event, params) => {
    const wc = mainWin?.webContents;
    if (!wc) return;
    const template = buildContextMenuTemplate(
      params,
      {
        openExternal: (url) => shell.openExternal(url),
        copyText: (text) => clipboard.writeText(text),
        copyImage: (url) => wc.copyImageAt(params.x, params.y) ?? url,
        replaceMisspelling: (word) => wc.replaceMisspelling(word),
        addToDictionary: (word) =>
          wc.session.addWordToSpellCheckerDictionary(word),
        inspectElement: (x, y) => wc.inspectElement(x, y),
        reload: () => wc.reload(),
      },
      { isPackaged: app.isPackaged },
    );
    Menu.buildFromTemplate(template).popup({ window: mainWin ?? undefined });
  });

  // Let the web app recognise the shell (it then skips the landing page).
  mainWin.webContents.setUserAgent(
    buildDesktopUserAgent(mainWin.webContents.getUserAgent(), app.getVersion()),
  );

  mainWin.loadURL(appEntryUrl());

  mainWin.once("ready-to-show", () => {
    if (state.maximized) mainWin?.maximize();
    fadeInWindow(mainWin);
    // Let the app's first frame land before the splash disappears so the
    // hand-off reads as a cross-fade rather than a flash.
    setTimeout(() => {
      loadingWin?.destroy();
      loadingWin = null;
    }, 180);
  });

  trackWindowState(mainWin, windowStatePath());

  // Route window.open() calls appropriately.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    // The "Login with OpenHands Cloud" device-flow opens about:blank immediately
    // on the user's click (to beat popup blockers), then navigates the popup to
    // the OAuth verification URL once it has one.  We must allow about:blank
    // through so window.open() returns a non-null WindowProxy; the did-create-window
    // handler below redirects the popup to the system browser when it navigates.
    if (url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { width: 800, height: 700 },
      };
    }
    // All other external URLs open directly in the system browser.
    if (!isAppUrl(url, appOrigins())) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // When the renderer opens a popup (the about:blank above), watch for its
  // first navigation away from about:blank.  That navigation will be to the
  // OAuth verification URL — open it in the system browser and close the
  // now-unneeded Electron popup.
  mainWin.webContents.on("did-create-window", (popupWin) => {
    popupWin.webContents.on("will-navigate", (_event, url) => {
      if (url !== "about:blank" && !isAppUrl(url, appOrigins())) {
        _event.preventDefault();
        shell.openExternal(url);
        popupWin.close();
      }
    });
  });

  mainWin.on("closed", () => {
    mainWin = null;
  });
}

// ── Startup log buffer ────────────────────────────────────────────────────────
//
// Every service log line (all services, all levels, sanitized) is kept in a
// bounded buffer and streamed to the loading window's console in batches over
// IPC (see preload.cjs + loading.html). The buffer is the single source of
// truth: it is replayed once the page loads (lines emitted earlier would
// otherwise be lost) and it backs the "Copy logs" action. In a packaged app
// this console is the only log surface — stdout/stderr go to /dev/null when
// launched from Finder, and the winston file logger is a no-op there (see
// AGENTS.md on the node_modules strip).

const BOOT_LOG_MAX_LINES = 2000;
const BOOT_LOG_FLUSH_MS = 200;

const bootLog = []; // {name, line, level}[] — level: stdout|stderr|info|warn|error
let bootLogPending = [];
let bootLogFlushTimer = null;
let bootLogReady = false; // true once loading.html has loaded and can receive
let fatalSummary = null;

// SGR color codes AND cursor-control CSI sequences (uv/uvicorn can emit
// either when they mis-detect a TTY).
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Strip ANSI escapes and reduce carriage-return progress redraws (e.g. uv
 * download bars arrive as one chunk of "\r"-separated frames) to the final
 * frame — what a real terminal would have settled on.
 */
function sanitizeLogLine(line) {
  const frames = String(line ?? "")
    .replace(ANSI_CSI_RE, "")
    .split("\r")
    .map((s) => s.trim())
    .filter(Boolean);
  return frames.length ? frames[frames.length - 1] : "";
}

function appendBootLog(name, line, level) {
  const entry = { name, line, level };
  bootLog.push(entry);
  if (bootLog.length > BOOT_LOG_MAX_LINES) {
    bootLog.splice(0, bootLog.length - BOOT_LOG_MAX_LINES);
  }
  bootLogPending.push(entry);
  if (!bootLogFlushTimer) {
    bootLogFlushTimer = setTimeout(flushBootLog, BOOT_LOG_FLUSH_MS);
  }
}

function flushBootLog() {
  clearTimeout(bootLogFlushTimer);
  bootLogFlushTimer = null;
  if (!bootLogPending.length) return;
  const batch = bootLogPending;
  bootLogPending = [];
  // Not ready / window gone: drop the batch — the entries stay in bootLog,
  // which did-finish-load replays wholesale.
  if (bootLogReady && loadingWin && !loadingWin.isDestroyed()) {
    loadingWin.webContents.send("boot-log:batch", batch);
  }
}

/**
 * Switch the splash into its failure state: expand the console and show the
 * error summary with Copy logs / Quit actions, keeping the window open so the
 * user can actually read why startup failed. Returns false when the loading
 * window is gone (caller falls back to a native dialog).
 */
function showStartupFailure(summary) {
  if (!loadingWin || loadingWin.isDestroyed()) return false;
  fatalSummary = summary;
  setLoadingWindowExpanded(true);
  if (bootLogReady) {
    flushBootLog();
    loadingWin.webContents.send("boot-log:fatal", summary);
  }
  // If the page hasn't loaded yet, did-finish-load replays the buffer and
  // then delivers fatalSummary.
  return true;
}

// IPC surface for the loading window (see preload.cjs). Guarded to that
// window's webContents so the main app window can never reach these.
function isLoadingWinEvent(event) {
  return (
    loadingWin !== null &&
    !loadingWin.isDestroyed() &&
    event.sender === loadingWin.webContents
  );
}

ipcMain.handle("boot-log:set-expanded", (event, expanded) => {
  if (!isLoadingWinEvent(event)) return;
  setLoadingWindowExpanded(Boolean(expanded));
});

ipcMain.handle("boot-log:copy", (event) => {
  if (!isLoadingWinEvent(event)) return 0;
  clipboard.writeText(bootLog.map((e) => `[${e.name}] ${e.line}`).join("\n"));
  return bootLog.length;
});

// The frameless splash has no close control; the failure state shows a Quit
// button instead.
ipcMain.handle("boot-log:quit", (event) => {
  if (!isLoadingWinEvent(event)) return;
  app.quit();
});

ipcMain.handle("boot-log:retry", (event) => {
  if (!isLoadingWinEvent(event)) return;
  app.relaunch();
  app.quit();
});

// Failure-state escape hatch: switch to the other agent-server mode.
ipcMain.handle("boot-log:switch-mode", (event, mode) => {
  if (!isLoadingWinEvent(event)) return;
  if (mode === "remote" || mode === "local") switchDesktopMode(mode);
});

// ── Backend stack ─────────────────────────────────────────────────────────────

/**
 * Update the status line on the loading window, if it's still alive.
 *
 * The loading screen exposes a global `window.__setLoadingStatus(line)`
 * function (see loading.html) that swaps the status text. We call it via
 * `executeJavaScript` so no preload script / IPC plumbing is needed.
 *
 * Best-effort: any failure (window destroyed, JS not loaded yet, etc.) is
 * swallowed — this is purely a UX nicety and must never crash the launcher.
 */
function setLoadingStatus(line) {
  if (!loadingWin || loadingWin.isDestroyed()) return;
  // Limit to a single line, max ~120 chars, to keep the splash readable.
  const oneLine = String(line ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!oneLine) return;
  const safe = JSON.stringify(oneLine);
  loadingWin.webContents
    .executeJavaScript(
      `window.__setLoadingStatus && window.__setLoadingStatus(${safe});`,
      true,
    )
    .catch(() => {});
}

/**
 * Phase marker: headline + a line in the startup-log console, so the log
 * records which stage a failed boot died in.
 */
function setBootPhase(message) {
  appendBootLog("desktop", message, "info");
  setLoadingStatus(message);
}

/**
 * Last few `level: "error"` service log lines (spawn failures, non-zero
 * exits). Appended to the startup-failure dialog: a packaged app launched
 * from Finder has stdout/stderr wired to /dev/null, so without this a
 * crashed ingress/static-server surfaces only as an opaque "timed out
 * waiting for http://localhost:8000" message.
 */
const recentServiceErrors = [];

/**
 * Forward dev-stack service log lines to (a) the loading screen and (b) the
 * terminal log. The terminal already receives them via `logService`; we add
 * a tee here so the user can see what's happening on first launch when uvx
 * is downloading Python + agent-server.
 */
function handleServiceLog(name, line, level) {
  if (!line) return;
  const clean = sanitizeLogLine(line);
  if (!clean) return;
  // Full-fidelity stream: every service and level goes to the console buffer.
  // The one-line headline below stays filtered to the interesting services.
  appendBootLog(name, clean, level);
  // The headline shows a short human phase, never raw pip/uvicorn output —
  // the full stream is one "Show details" click away.
  const phase = friendlyBootStatus(name, clean);
  if (phase) setLoadingStatus(phase);
  // Mirror errors to a `[desktop]` terminal line so dev runs stay grep-friendly.
  if (level === "error") {
    console.error(`[desktop] [${name}] ${clean}`);
    recentServiceErrors.push(`${name}: ${clean}`);
    if (recentServiceErrors.length > 5) recentServiceErrors.shift();
  }
}

async function startStack() {
  const entryUrl = pathToFileURL(
    join(scriptsDir, "dev-with-automation.mjs"),
  ).href;
  const { main } = await import(entryUrl);

  // main() starts agent-server + automation backend + static server + ingress.
  //   skipNpmCheck: npm is not needed at runtime in static mode.
  //   agentServerReadyTimeoutMs: dev defaults to 60 s (warm uvx cache); a
  //     packaged binary on a fresh machine can spend several minutes inside
  //     uvx the first time, downloading Python + installing openhands-
  //     agent-server from PyPI. 10 minutes is generous but bounded.
  //   onServiceLog: stream uvx/agent-server output to the loading window so
  //     the user sees progress instead of an indefinite spinner.
  const result = await main({
    bannerTitle: "Neo",
    staticMode: true,
    staticDir: buildDir,
    mode: "agent-canvas",
    isPublic: false,
    skipNpmCheck: true,
    agentServerReadyTimeoutMs: 10 * 60_000,
    onServiceLog: handleServiceLog,
  });

  // main() returns { config, agentServerReady } — treat a timeout as a fatal
  // startup error so the splash shows a clear dialog instead of dropping the
  // user into a half-booted UI that will only emit "Request timeout" popups.
  if (result?.agentServerReady === false) {
    throw new Error(
      "The agent server did not finish starting in time. " +
        "On first launch this can take several minutes while uvx downloads " +
        "Python and the required agent-server packages from PyPI. " +
        "Check your internet connection and try again.",
    );
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

/** @type {{ shouldStayInBackground: () => boolean } | null} */
let background = null;

// One Neo at a time: the stack binds fixed ports (8000/18000/18001), so a
// second launch would only fail at startup. Hand the activation (and any
// neo:// link in its argv) to the running instance and exit.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((a) => a.startsWith(`${DEEP_LINK_PROTOCOL}://`));
    const path = link ? deepLinkToPath(link) : null;
    if (path) navigateMainWindow(path);
    else showMainWindow();
  });
}

// neo://… links (macOS delivers them via open-url, Windows/Linux via argv).
if (app.isPackaged) {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}
app.on("open-url", (event, url) => {
  event.preventDefault();
  const path = deepLinkToPath(url);
  if (path) navigateMainWindow(path);
  else showMainWindow();
});

/** Folder the launcher's winston file logger writes to. */
function logsFolder() {
  return join(homedir(), ".openhands", "agent-canvas", "logs");
}

function diagnosticInfo() {
  return [
    `${APP_NAME} ${app.getVersion()}`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
    `Platform ${process.platform} ${process.arch} · ${process.getSystemVersion?.() ?? ""}`,
    `Packaged: ${app.isPackaged}`,
    `User data: ${app.getPath("userData")}`,
    `Logs: ${logsFolder()}`,
  ].join("\n");
}

/** Native menu bar + dock menu + About panel. */
function installAppMenus() {
  const actions = {
    navigate: navigateMainWindow,
    openExternal: (url) => shell.openExternal(url),
    showAbout: () => app.showAboutPanel(),
    showMainWindow,
    openLogsFolder: () => shell.openPath(logsFolder()),
    copyDiagnostics: () => clipboard.writeText(diagnosticInfo()),
    toggleSidebar: () => {
      showMainWindow();
      mainWin?.webContents
        .executeJavaScript(TOGGLE_SIDEBAR_SCRIPT, true)
        .catch(() => {});
    },
    reloadApp: () => mainWin?.webContents.reload(),
    checkForUpdates: () => checkForUpdates({ interactive: true }),
    setMode: (mode) => switchDesktopMode(mode),
    currentMode: () => desktopPrefs.mode,
  };

  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron}`,
    copyright: "© 2026 NeoDevEx",
    credits:
      "AI coding agents, on your Mac.\nBuilt on the OpenHands agent SDK.",
    iconPath: appIconPath,
    website: "https://neo.neodevex.com",
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildAppMenuTemplate({
        platform: process.platform,
        appName: APP_NAME,
        version: app.getVersion(),
        actions,
        isPackaged: app.isPackaged,
      }),
    ),
  );

  if (process.platform === "darwin" && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate(buildDockMenuTemplate(actions)));
  }
}

/** True once the backend stack answered; the main window needs it. */
let stackReady = false;

/** Show the main window, creating it again after it was closed. */
function showMainWindow() {
  app.dock?.show();
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.show();
    mainWin.focus();
    return;
  }
  // Still booting (second launch / dock click / neo:// link during the
  // splash): bring the splash forward instead of opening a window that
  // would only show a connection error.
  if (!stackReady) {
    if (loadingWin && !loadingWin.isDestroyed()) {
      loadingWin.show();
      loadingWin.focus();
    }
    return;
  }
  createMainWindow();
}

/**
 * Remote mode readiness: the hosted app must answer before the window opens,
 * so an offline laptop gets the splash's clear failure state instead of a
 * Chromium error page.
 */
async function waitForRemoteApp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.status < 500) return;
      lastError = new Error(`${url} answered ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `Could not reach ${new URL(url).host}${lastError ? ` (${lastError.message})` : ""}.`,
  );
}

// ── Updates ───────────────────────────────────────────────────────────────────

let updateCheckInFlight = false;

/**
 * Compare the running version with the latest GitHub release. Interactive
 * (menu) checks always report; the background check only speaks up when a
 * newer version exists.
 */
async function checkForUpdates({ interactive }) {
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  try {
    const release = await fetchLatestRelease(GITHUB_REPO);
    desktopPrefs = {
      ...desktopPrefs,
      lastUpdateCheckAt: new Date().toISOString(),
    };
    saveDesktopPrefs(desktopPrefsPath(), desktopPrefs);

    if (!release) {
      if (interactive) {
        dialog.showMessageBox({
          type: "info",
          title: "Check for Updates",
          message: "Could not check for updates right now.",
          detail: "Check your internet connection and try again.",
        });
      }
      return;
    }
    const current = app.getVersion();
    if (!isNewerVersion(release.version, current)) {
      if (interactive) {
        dialog.showMessageBox({
          type: "info",
          title: "Check for Updates",
          message: `${APP_NAME} ${current} is up to date.`,
        });
      }
      return;
    }
    const asset = pickReleaseAsset(
      release.assets,
      process.platform,
      process.arch,
    );
    const downloadUrl = asset?.browser_download_url || release.url;
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Update Available",
      message: `${APP_NAME} ${release.version.replace(/^v/, "")} is available.`,
      detail: `You have ${current}. Download the new version to get the latest desktop features.`,
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0 && downloadUrl) shell.openExternal(downloadUrl);
  } finally {
    updateCheckInFlight = false;
  }
}

function scheduleBackgroundUpdateCheck() {
  if (!app.isPackaged) return;
  if (!isUpdateCheckDue(desktopPrefs.lastUpdateCheckAt)) return;
  const t = setTimeout(() => {
    checkForUpdates({ interactive: false }).catch(() => {});
  }, 15_000);
  if (t.unref) t.unref();
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";
  app.setName(APP_NAME);
  desktopPrefs = loadDesktopPrefs(desktopPrefsPath());
  installAppMenus();

  // Set the dock icon explicitly on macOS so `npm run desktop` shows the
  // Neo logo instead of the default Electron logo. In a packaged
  // build the .app bundle's icon.icns already provides this, but
  // app.dock.setIcon() is a cheap idempotent override that also fixes
  // the dev workflow.
  if (process.platform === "darwin" && app.dock && existsSync(appIconPath)) {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath));
  }

  injectBundledUv();
  injectBundledNode();

  if (isLocalMode() && !uvxAvailable()) {
    dialog.showErrorBox(
      "Missing prerequisite: uv",
      app.isPackaged
        ? "The bundled uv binary could not be found. Please reinstall Neo."
        : "uv (uvx) is not installed.\n\nInstall it from https://docs.astral.sh/uv/ then restart.",
    );
    app.quit();
    return;
  }

  // Started by the "Open at login" item: bring the stack up without a
  // window, so automations run from the moment the user signs in. Only
  // meaningful in local mode — the hosted backend runs automations itself.
  const startHidden =
    isLocalMode() &&
    launchedInBackground(process.argv, app.getLoginItemSettings());
  if (startHidden) app.dock?.hide();
  else createLoadingWindow();
  const splashShownAt = Date.now();

  try {
    if (isLocalMode()) {
      setBootPhase("Starting the local agent server…");
      await startStack();

      // Stage 1: ingress proxy is bound (anything < 500 on /).
      setBootPhase("Almost there…");
      await waitForUrl(LOCAL_APP_URL);

      // Stage 2: the agent-server behind the proxy is actually serving
      // requests. `startStack()` already waited for this internally, but we
      // re-probe end-to-end here so that if the user closes the splash race
      // window between processes binding, we still open the main window with
      // a live backend. Cheap (a single 200 response) when everything is up.
      await waitForAgentServer(`${LOCAL_APP_URL}/server_info`, 60_000);

      background = setupBackgroundMode({
        app,
        Tray,
        Menu,
        Notification,
        nativeImage,
        iconPath: trayIconPath,
        prefsPath: join(app.getPath("userData"), "background-mode.json"),
        openWindow: showMainWindow,
      });
    } else {
      setBootPhase("Connecting to Neo…");
      await waitForRemoteApp(REMOTE_APP_URL, 15_000);
    }

    setBootPhase("Ready.");
    stackReady = true;
    // Let the opening animation finish before the hand-off.
    const remaining = MIN_SPLASH_MS - (Date.now() - splashShownAt);
    if (remaining > 0 && !startHidden) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    if (!startHidden) createMainWindow();
    scheduleBackgroundUpdateCheck();
  } catch (err) {
    const summary = isLocalMode()
      ? `${err.message} Ensure ports 8000, 18000, and 18001 are free, then try again.`
      : `${err.message} Check your internet connection and try again, or switch to a local agent server from the Neo menu.`;
    // Record the failure in the terminal and the startup-log buffer so it
    // shows (and copies) as the final console line.
    console.error("[desktop] Startup failed:", err);
    appendBootLog("desktop", summary, "error");
    // Keep the splash open in its failure state so the full startup log can
    // be read and copied; the app quits via the splash's Quit button (or
    // Cmd+Q / closing the window).
    if (showStartupFailure(summary)) return;
    // Loading window already gone — fall back to the old dialog-and-quit.
    const errorTail = recentServiceErrors.length
      ? `\n\nRecent service errors:\n${recentServiceErrors.join("\n")}`
      : "";
    dialog.showErrorBox(`${APP_NAME} failed to start`, summary + errorTail);
    app.quit();
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
//
// dev-with-automation.mjs spawns the backend processes with detached:true so
// they form their own OS process groups and survive the parent's death by
// default. We must explicitly kill them when the app quits.
//
// createShutdownHookRegistry (dev-process-utils.mjs) already registered a
// SIGTERM handler that iterates every tracked process, calls signalProcessTree
// on its group, waits for exit, then calls process.exit(0). We just need to
// fire that handler before Electron lets the process die.
//
// Flow:
//   user closes window / Cmd+Q
//     → window-all-closed → app.quit()
//     → before-quit fires (first time)  → we preventDefault + send SIGTERM
//     → SIGTERM handler kills all children, calls process.exit(0)
//     → before-quit fires again (cleanupStarted=true) → we return, Electron exits
//
// Windows has no real POSIX signals: process.kill(pid, "SIGTERM") would
// terminate this process WITHOUT running the "SIGTERM" listener, skipping
// cleanup and orphaning the children on ports 8000/18000/18001 (the next
// launch then fails at startup). process.emit("SIGTERM") runs the same
// registered handler in-process instead.

let cleanupStarted = false;

app.on("before-quit", (event) => {
  if (cleanupStarted) return; // SIGTERM cleanup already running — allow exit

  cleanupStarted = true;
  event.preventDefault();

  console.log("[desktop] Stopping backend services…");
  if (process.platform === "win32") {
    // Run the cleanup handler in-process (see header note). emit() returns
    // false when no listener is registered — the stack never started, so
    // there is nothing to clean up and we can exit immediately.
    if (!process.emit("SIGTERM")) app.exit(0);
  } else {
    process.kill(process.pid, "SIGTERM");
  }

  // Safety net: if the SIGTERM handler doesn't finish within 6 s, force-quit.
  const t = setTimeout(() => {
    console.warn("[desktop] Cleanup timed out — forcing exit");
    app.exit(0);
  }, 6000);
  if (t.unref) t.unref();
});

app.on("window-all-closed", () => {
  // Keep the stack (scheduler, GitHub bridge, automation guard) alive in
  // the background unless the user turned that off or there is no tray.
  if (background?.shouldStayInBackground()) {
    app.dock?.hide();
    return;
  }
  app.quit();
});

// macOS: clicking the dock icon when no window is open re-launches the app.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // The backend is already running — just open a new renderer window.
    if (mainWin === null) showMainWindow();
  }
});
