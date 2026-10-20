// @vitest-environment node
// Remote-vs-local agent-server mode, the friendly boot headline, and the
// GitHub-release update check — all pure helpers of the desktop shell.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOT_PHASES,
  DEFAULT_DESKTOP_PREFS,
  DESKTOP_UA_TOKEN,
  FALLBACK_REMOTE_APP_URL,
  REMOTE_URL_ENV,
  buildDesktopUserAgent,
  friendlyBootStatus,
  isAppUrl,
  loadDesktopPrefs,
  remoteEntryUrl,
  resolveRemoteAppUrl,
  saveDesktopPrefs,
} from "../../electron/desktop-mode.mjs";
import {
  fetchLatestRelease,
  isNewerVersion,
  isUpdateCheckDue,
  pickReleaseAsset,
} from "../../electron/updates.mjs";
import {
  AGENT_SERVER_MODE_LABELS,
  buildAppMenuTemplate,
} from "../../electron/app-menu.mjs";
import { DESKTOP_APP_UA_TOKEN } from "../../src/utils/utils";

describe("desktop mode preferences", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("defaults to the hosted (remote) agent server and round-trips a choice", () => {
    const dir = mkdtempSync(join(tmpdir(), "neo-mode-"));
    dirs.push(dir);
    const path = join(dir, "nested", "desktop-mode.json");

    expect(DEFAULT_DESKTOP_PREFS.mode).toBe("remote");
    expect(loadDesktopPrefs(path)).toEqual(DEFAULT_DESKTOP_PREFS);

    saveDesktopPrefs(path, {
      mode: "local",
      lastUpdateCheckAt: "2026-10-20T00:00:00Z",
    });
    expect(loadDesktopPrefs(path)).toEqual({
      mode: "local",
      lastUpdateCheckAt: "2026-10-20T00:00:00Z",
    });

    writeFileSync(path, JSON.stringify({ mode: "cloud?" }));
    expect(loadDesktopPrefs(path).mode).toBe("remote");
  });
});

describe("remote app URL", () => {
  it("prefers the env override, then config, then the fallback, and rejects non-http", () => {
    expect(
      resolveRemoteAppUrl({
        env: { [REMOTE_URL_ENV]: "https://staging.example.com/" },
        defaults: { desktop: { remoteAppUrl: "https://neo.example.com" } },
      }),
    ).toBe("https://staging.example.com");
    expect(
      resolveRemoteAppUrl({
        env: {},
        defaults: { desktop: { remoteAppUrl: "https://neo.example.com/" } },
      }),
    ).toBe("https://neo.example.com");
    expect(
      resolveRemoteAppUrl({ env: { [REMOTE_URL_ENV]: "file:///etc" } }),
    ).toBe(FALLBACK_REMOTE_APP_URL);
  });

  it("opens the console, never the landing page", () => {
    expect(remoteEntryUrl("https://neo.example.com")).toBe(
      "https://neo.example.com/conversations",
    );
  });

  it("keeps app origins in the window and sends the rest to the browser", () => {
    const origins = ["https://neo.example.com", "http://localhost:8000"];
    expect(isAppUrl("https://neo.example.com/settings", origins)).toBe(true);
    expect(isAppUrl("http://localhost:8000/x", origins)).toBe(true);
    expect(isAppUrl("https://github.com/login", origins)).toBe(false);
    expect(isAppUrl("not a url", origins)).toBe(false);
  });

  it("tags the user agent with the token the web app looks for", () => {
    const ua = buildDesktopUserAgent("Mozilla/5.0 Chrome/142", "1.13.0");
    expect(ua).toBe("Mozilla/5.0 Chrome/142 NeoDesktop/1.13.0");
    expect(DESKTOP_UA_TOKEN).toBe(DESKTOP_APP_UA_TOKEN);
  });
});

describe("friendly boot status", () => {
  it.each([
    [
      "agent-server",
      "Downloaded google-api-python-client",
      BOOT_PHASES.download,
    ],
    ["agent-server", "Resolved 212 packages in 1.2s", BOOT_PHASES.download],
    ["agent-server", "Installed 212 packages in 3.4s", BOOT_PHASES.install],
    [
      "agent-server",
      "Downloading cpython-3.12.4-macos-aarch64",
      BOOT_PHASES.python,
    ],
    [
      "agent-server",
      "INFO: Uvicorn running on http://127.0.0.1:18000",
      BOOT_PHASES.starting,
    ],
    [
      "automation",
      "INFO: Application startup complete.",
      BOOT_PHASES.automation,
    ],
    ["ingress", "proxying /api to 18000", null],
    ["agent-server", "", null],
  ])("maps %s: %s", (service, line, expected) => {
    expect(friendlyBootStatus(service, line)).toBe(expected);
  });
});

describe("agent server menu", () => {
  const actions = (mode: "remote" | "local") => ({
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
    currentMode: () => mode,
  });

  it("offers Neo Cloud and local as radio items with the current one checked", () => {
    const a = actions("remote");
    const template = buildAppMenuTemplate({
      platform: "darwin",
      appName: "Neo",
      version: "1.0.0",
      actions: a,
    }) as Array<{
      submenu: Array<{
        id?: string;
        submenu?: Array<{
          id: string;
          type: string;
          checked: boolean;
          label: string;
          click: () => void;
        }>;
      }>;
    }>;
    const agentServer = template[0].submenu.find(
      (i) => i.id === "agent-server",
    )!;
    expect(
      agentServer.submenu!.map((i) => [i.id, i.type, i.checked, i.label]),
    ).toEqual([
      ["mode-remote", "radio", true, AGENT_SERVER_MODE_LABELS.remote],
      ["mode-local", "radio", false, AGENT_SERVER_MODE_LABELS.local],
    ]);
    agentServer.submenu![1].click();
    expect(a.setMode).toHaveBeenCalledWith("local");
  });

  it("routes Check for Updates to the updater, not a web page", () => {
    const a = actions("local");
    const template = buildAppMenuTemplate({
      platform: "win32",
      appName: "Neo",
      version: "1.0.0",
      actions: a,
    }) as Array<{ submenu: Array<{ id?: string; click?: () => void }> }>;
    template[0].submenu.find((i) => i.id === "check-updates")!.click!();
    expect(a.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(a.openExternal).not.toHaveBeenCalled();
  });
});

describe("update check", () => {
  it.each([
    ["v1.14.0", "1.13.0", true],
    ["1.13.1", "1.13.0", true],
    ["1.13.0", "1.13.0", false],
    ["1.13.0-rc.1", "1.13.0", false],
    ["1.13.0", "1.13.0-rc.1", true],
    ["garbage", "1.13.0", false],
  ])("isNewerVersion(%s, %s) → %s", (candidate, current, expected) => {
    expect(isNewerVersion(candidate, current)).toBe(expected);
  });

  it("picks the installer for the running platform and arch", () => {
    const assets = [
      { name: "Neo-1.14.0-arm64.dmg", browser_download_url: "u/arm" },
      { name: "Neo-1.14.0-x64.dmg", browser_download_url: "u/x64" },
      { name: "Neo-Setup-1.14.0.exe", browser_download_url: "u/win" },
    ];
    expect(
      pickReleaseAsset(assets, "darwin", "arm64")?.browser_download_url,
    ).toBe("u/arm");
    expect(
      pickReleaseAsset(assets, "darwin", "x64")?.browser_download_url,
    ).toBe("u/x64");
    expect(pickReleaseAsset(assets, "win32", "x64")?.browser_download_url).toBe(
      "u/win",
    );
    expect(pickReleaseAsset([], "win32", "x64")).toBeNull();
  });

  it("is due once a day and never throws on a bad response", async () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(isUpdateCheckDue(null, now)).toBe(true);
    expect(isUpdateCheckDue("2026-10-20T01:00:00Z", now)).toBe(false);
    expect(isUpdateCheckDue("2026-10-19T01:00:00Z", now)).toBe(true);

    const ok = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag_name: "v1.14.0", html_url: "h", assets: [] }),
    }));
    expect(await fetchLatestRelease("o/r", { fetchImpl: ok as never })).toEqual(
      {
        version: "v1.14.0",
        url: "h",
        assets: [],
      },
    );
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(
      await fetchLatestRelease("o/r", { fetchImpl: failing as never }),
    ).toBeNull();
    const rateLimited = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));
    expect(
      await fetchLatestRelease("o/r", { fetchImpl: rateLimited as never }),
    ).toBeNull();
  });
});
