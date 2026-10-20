/**
 * Native application menu for the Neo desktop app.
 *
 * `buildAppMenuTemplate` is a pure function returning an Electron
 * MenuItemConstructorOptions[] so the structure can be unit-tested without
 * Electron. Callbacks are injected through `actions`; every `id` in the
 * template maps to one of them.
 *
 * Shape follows the macOS Human Interface Guidelines so the app feels like
 * its native neighbours (Claude, Codex, Cursor): App ▸ File ▸ Edit ▸ View ▸
 * Go ▸ Window ▸ Help. On Windows/Linux the app menu folds into File.
 */

/** In-app routes the menu navigates to (see src/routes.ts). */
export const MENU_ROUTES = Object.freeze({
  newConversation: "/conversations",
  conversations: "/conversations",
  automations: "/automations",
  skills: "/skills",
  mcp: "/mcp",
  environment: "/environment",
  agentOps: "/agentops",
  usage: "/usage",
  settings: "/settings",
});

export const HELP_LINKS = Object.freeze({
  documentation: "https://github.com/vamsi920/repo-reel-studio#readme",
  reportIssue: "https://github.com/vamsi920/repo-reel-studio/issues/new",
  releases: "https://github.com/vamsi920/repo-reel-studio/releases",
});

/**
 * @typedef {{
 *   navigate: (path: string) => void,
 *   openExternal: (url: string) => void,
 *   showAbout: () => void,
 *   showMainWindow: () => void,
 *   openLogsFolder: () => void,
 *   copyDiagnostics: () => void,
 *   toggleSidebar: () => void,
 *   reloadApp: () => void,
 * }} MenuActions
 */

/**
 * @param {{ platform: NodeJS.Platform, appName: string, version: string, actions: MenuActions, isPackaged?: boolean }} options
 * @returns {import("electron").MenuItemConstructorOptions[]}
 */
export function buildAppMenuTemplate({
  platform,
  appName,
  version,
  actions,
  isPackaged = true,
}) {
  const isMac = platform === "darwin";
  const go = (path) => () => actions.navigate(path);

  /** @type {import("electron").MenuItemConstructorOptions} */
  const appMenu = {
    label: appName,
    submenu: [
      {
        id: "about",
        label: `About ${appName}`,
        click: () => actions.showAbout(),
      },
      {
        id: "check-updates",
        label: "Check for Updates…",
        click: () => actions.openExternal(HELP_LINKS.releases),
      },
      { type: "separator" },
      {
        id: "settings",
        label: "Settings…",
        accelerator: "CmdOrCtrl+,",
        click: go(MENU_ROUTES.settings),
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  /** @type {import("electron").MenuItemConstructorOptions} */
  const fileMenu = {
    label: "File",
    submenu: [
      {
        id: "new-conversation",
        label: "New Conversation",
        accelerator: "CmdOrCtrl+N",
        click: go(MENU_ROUTES.newConversation),
      },
      {
        id: "new-window",
        label: "Open Main Window",
        accelerator: "CmdOrCtrl+Shift+N",
        click: () => actions.showMainWindow(),
      },
      { type: "separator" },
      ...(isMac
        ? [{ role: "close" }]
        : [
            {
              id: "settings",
              label: "Settings…",
              accelerator: "CmdOrCtrl+,",
              click: go(MENU_ROUTES.settings),
            },
            { type: "separator" },
            { role: "quit" },
          ]),
    ],
  };

  /** @type {import("electron").MenuItemConstructorOptions} */
  const editMenu = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" },
            { role: "delete" },
            { role: "selectAll" },
            { type: "separator" },
            {
              label: "Speech",
              submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
            },
          ]
        : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
    ],
  };

  /** @type {import("electron").MenuItemConstructorOptions} */
  const viewMenu = {
    label: "View",
    submenu: [
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        accelerator: "CmdOrCtrl+B",
        click: () => actions.toggleSidebar(),
      },
      { type: "separator" },
      {
        id: "reload",
        label: "Reload",
        accelerator: "CmdOrCtrl+R",
        click: () => actions.reloadApp(),
      },
      ...(isPackaged ? [] : [{ role: "forceReload" }]),
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  /** @type {import("electron").MenuItemConstructorOptions} */
  const goMenu = {
    label: "Go",
    submenu: [
      {
        id: "go-conversations",
        label: "Conversations",
        accelerator: "CmdOrCtrl+1",
        click: go(MENU_ROUTES.conversations),
      },
      {
        id: "go-automations",
        label: "Automations",
        accelerator: "CmdOrCtrl+2",
        click: go(MENU_ROUTES.automations),
      },
      {
        id: "go-skills",
        label: "Skills",
        accelerator: "CmdOrCtrl+3",
        click: go(MENU_ROUTES.skills),
      },
      {
        id: "go-mcp",
        label: "MCP Servers",
        accelerator: "CmdOrCtrl+4",
        click: go(MENU_ROUTES.mcp),
      },
      {
        id: "go-environment",
        label: "Environment",
        accelerator: "CmdOrCtrl+5",
        click: go(MENU_ROUTES.environment),
      },
      {
        id: "go-agentops",
        label: "AgentOps",
        accelerator: "CmdOrCtrl+6",
        click: go(MENU_ROUTES.agentOps),
      },
      {
        id: "go-usage",
        label: "Usage",
        accelerator: "CmdOrCtrl+7",
        click: go(MENU_ROUTES.usage),
      },
    ],
  };

  /** @type {import("electron").MenuItemConstructorOptions} */
  const windowMenu = {
    label: "Window",
    role: "window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      ...(isMac
        ? [
            { type: "separator" },
            { role: "front" },
            { type: "separator" },
            {
              id: "window-main",
              label: appName,
              click: () => actions.showMainWindow(),
            },
          ]
        : [{ role: "close" }]),
    ],
  };

  /** @type {import("electron").MenuItemConstructorOptions} */
  const helpMenu = {
    label: "Help",
    role: "help",
    submenu: [
      {
        id: "help-docs",
        label: `${appName} Documentation`,
        click: () => actions.openExternal(HELP_LINKS.documentation),
      },
      {
        id: "help-issue",
        label: "Report an Issue…",
        click: () => actions.openExternal(HELP_LINKS.reportIssue),
      },
      { type: "separator" },
      {
        id: "help-logs",
        label: "Open Logs Folder",
        click: () => actions.openLogsFolder(),
      },
      {
        id: "help-diagnostics",
        label: "Copy Diagnostic Info",
        click: () => actions.copyDiagnostics(),
      },
      ...(isMac
        ? []
        : [
            { type: "separator" },
            {
              id: "about",
              label: `About ${appName} ${version}`,
              click: () => actions.showAbout(),
            },
          ]),
    ],
  };

  return [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    goMenu,
    windowMenu,
    helpMenu,
  ];
}

/**
 * Dock (macOS) / jump-list style menu: the two things people reach for.
 * @param {MenuActions} actions
 * @returns {import("electron").MenuItemConstructorOptions[]}
 */
export function buildDockMenuTemplate(actions) {
  return [
    {
      id: "new-conversation",
      label: "New Conversation",
      click: () => actions.navigate(MENU_ROUTES.newConversation),
    },
    {
      id: "automations",
      label: "Automations",
      click: () => actions.navigate(MENU_ROUTES.automations),
    },
    { type: "separator" },
    {
      id: "settings",
      label: "Settings…",
      click: () => actions.navigate(MENU_ROUTES.settings),
    },
  ];
}

/**
 * Flatten a template (submenus included) to its `id`s — handy for tests and
 * for asserting every id has an action.
 * @param {import("electron").MenuItemConstructorOptions[]} template
 * @returns {string[]}
 */
export function collectMenuIds(template) {
  const ids = [];
  const walk = (items) => {
    for (const item of items) {
      if (item.id) ids.push(item.id);
      if (Array.isArray(item.submenu)) walk(item.submenu);
    }
  };
  walk(template);
  return ids;
}
