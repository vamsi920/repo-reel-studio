/**
 * Small pieces of CSS / JS the main process injects into the web app so it
 * behaves like a native window rather than a page in a frame.
 *
 * Kept as pure constants/functions (no Electron import) for unit testing.
 */

/**
 * Height of the strip reserved for the macOS traffic lights when the
 * window uses `titleBarStyle: "hiddenInset"`. Must agree with
 * TRAFFIC_LIGHT_POSITION in main.mjs (lights are 12 px tall, centred).
 */
export const TITLEBAR_HEIGHT_PX = 38;

/**
 * Desktop-only CSS, injected on every main-window load (webContents.insertCSS).
 *
 * - Pads the sidebar so the logo and controls sit below the traffic lights,
 *   and makes the sidebar's blank areas a drag region (like the Claude and
 *   Codex apps) while every control inside it stays clickable.
 * - Turns off text-selection on chrome-like elements only (buttons/links),
 *   so the app stops feeling like a web page without breaking selection of
 *   chat content.
 * - Hides scrollbars until hover, the macOS way.
 */
export function buildDesktopChromeCss({ platform }) {
  const mac = platform === "darwin";
  return `
/* ── Neo desktop shell (injected by electron/main.mjs) ───────────────── */
html, body { overscroll-behavior: none; }
button, a, [role="button"], [role="tab"], [role="menuitem"] {
  -webkit-user-select: none; user-select: none;
}
${
  mac
    ? `
aside[aria-label][data-collapsed] {
  padding-top: ${TITLEBAR_HEIGHT_PX}px;
  -webkit-app-region: drag;
}
aside[aria-label][data-collapsed] a,
aside[aria-label][data-collapsed] button,
aside[aria-label][data-collapsed] input,
aside[aria-label][data-collapsed] textarea,
aside[aria-label][data-collapsed] select,
aside[aria-label][data-collapsed] [role="button"],
aside[aria-label][data-collapsed] [role="menuitem"],
aside[aria-label][data-collapsed] [role="option"],
aside[aria-label][data-collapsed] [role="dialog"],
aside[aria-label][data-collapsed] [data-testid$="popover"],
aside[aria-label][data-collapsed] [contenteditable="true"] {
  -webkit-app-region: no-drag;
}
/* Pages without the sidebar (sign-in shell, landing nav): keep their logo
   header clear of the traffic lights and let it drag the window too. */
header.px-6.py-6,
header.sticky.top-0 > div {
  padding-top: ${TITLEBAR_HEIGHT_PX}px;
}
header.px-6.py-6,
header.sticky.top-0 {
  -webkit-app-region: drag;
}
header a, header button, header input {
  -webkit-app-region: no-drag;
}
`
    : ""
}
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); background-clip: padding-box; }
`;
}

/**
 * JS that performs an in-app navigation without a full reload. React Router
 * listens to `popstate`, so pushState + a synthetic popstate is enough and
 * keeps the running conversation sockets alive.
 *
 * @param {string} path app-relative path such as "/settings"
 */
export function buildNavigateScript(path) {
  const safe = JSON.stringify(String(path));
  return (
    `(function(){var p=${safe};` +
    `if(location.pathname===p){return;}` +
    `history.pushState({},"",p);` +
    `dispatchEvent(new PopStateEvent("popstate",{state:{}}));})();`
  );
}

/**
 * JS that toggles the sidebar by clicking the app's own collapse control, so
 * the menu's ⌘B stays in sync with the sidebar's persisted state.
 */
export const TOGGLE_SIDEBAR_SCRIPT =
  `(function(){var b=document.querySelector('[data-testid="sidebar-collapse-toggle"]');` +
  `if(b){b.click();return true;}return false;})();`;

/**
 * Parse a `neo://` deep link into an in-app path.
 *   neo://open                 → "/conversations"
 *   neo://open/settings/llm    → "/settings/llm"
 *   neo://conversations/abc    → "/conversations/abc"
 * Returns null for anything that is not a plain in-app path.
 *
 * @param {string} url
 * @returns {string | null}
 */
export function deepLinkToPath(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "neo:") return null;
  const host = parsed.hostname;
  let path = parsed.pathname.replace(/\/+$/, "");
  if (host === "open" || host === "") {
    path = path || "/conversations";
  } else {
    path = `/${host}${path}`;
  }
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(path)) return null;
  return path + (parsed.search || "");
}
