/**
 * Preload for the loading window (loading.html).
 *
 * Bridges the startup-log console to the main process over IPC while keeping
 * contextIsolation (and the default renderer sandbox) intact. The one-line
 * status headline intentionally does NOT go through here — main.mjs sets it
 * via executeJavaScript → window.__setLoadingStatus (see setLoadingStatus).
 *
 * CommonJS on purpose: sandboxed preload scripts cannot use ESM.
 */
const { contextBridge, ipcRenderer } = require("electron");

// main.mjs passes the app version through additionalArguments so the splash
// can show it (sandboxed preloads cannot reach `app`).
const VERSION_FLAG = "--neo-app-version=";
const MODE_FLAG = "--neo-desktop-mode=";
const argValue = (flag) =>
  (process.argv.find((arg) => arg.startsWith(flag)) ?? "").slice(flag.length);
const version = argValue(VERSION_FLAG) || "";
/** "remote" (hosted Neo) or "local" (bundled stack); see desktop-mode.mjs. */
const mode = argValue(MODE_FLAG) || "remote";

contextBridge.exposeInMainWorld("desktopBoot", {
  /** App version string (empty when unknown). */
  version,
  /** Agent-server mode the shell is booting in. */
  mode,
  /** Subscribe to batched startup-log lines: cb([{name, line, level}, …]). */
  onLogBatch(cb) {
    if (typeof cb !== "function") return;
    ipcRenderer.on("boot-log:batch", (_event, batch) => cb(batch));
  },
  /** Subscribe to the fatal startup-failure notification: cb(summary). */
  onFatal(cb) {
    if (typeof cb !== "function") return;
    ipcRenderer.on("boot-log:fatal", (_event, summary) => cb(summary));
  },
  /** Grow/shrink the window to reveal or hide the console panel. */
  setDetailsExpanded: (expanded) =>
    ipcRenderer.invoke("boot-log:set-expanded", Boolean(expanded)),
  /** Copy the full buffered startup log to the clipboard. */
  copyLogs: () => ipcRenderer.invoke("boot-log:copy"),
  /** Quit the app (failure-state action; the frameless splash has no close UI). */
  quit: () => ipcRenderer.invoke("boot-log:quit"),
  /** Relaunch and try the same mode again. */
  retry: () => ipcRenderer.invoke("boot-log:retry"),
  /** Relaunch into the other agent-server mode. */
  switchMode: (next) => ipcRenderer.invoke("boot-log:switch-mode", next),
});
