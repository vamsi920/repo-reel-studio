/**
 * Preload for the main window's shell pages (offline.html).
 *
 * Deliberately tiny: the hosted web app never gets a preload, so nothing
 * privileged is reachable from remote content. This bridge only exists for
 * the local error page and exposes two relaunch-style actions.
 *
 * CommonJS on purpose: sandboxed preload scripts cannot use ESM.
 */
const { contextBridge, ipcRenderer } = require("electron");

// Only the shell's own file:// pages get the bridge; the hosted/local web app
// shares this webContents and must not see it.
if (window.location.protocol === "file:") {
  contextBridge.exposeInMainWorld("desktopShell", {
    /** Reload the app URL (used by the offline page). */
    retry: () => ipcRenderer.invoke("shell:retry"),
    /** Relaunch into the other agent-server mode. */
    switchMode: (next) => ipcRenderer.invoke("shell:switch-mode", next),
  });
}
