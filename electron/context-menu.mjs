/**
 * Right-click context menu for the main window.
 *
 * Electron ships no context menu at all, which is the single most "this is
 * a web page in a frame" tell. This builds the native-feeling one: spelling
 * suggestions, cut/copy/paste in editable fields, copy for selections,
 * link/image actions, and Inspect Element in dev builds.
 *
 * Pure: takes the `context-menu` event params and returns a template.
 */

/**
 * @typedef {{
 *   openExternal: (url: string) => void,
 *   copyText: (text: string) => void,
 *   copyImage: (url: string) => void,
 *   replaceMisspelling: (word: string) => void,
 *   addToDictionary: (word: string) => void,
 *   inspectElement: (x: number, y: number) => void,
 *   reload: () => void,
 * }} ContextMenuActions
 */

/**
 * @param {import("electron").ContextMenuParams} params
 * @param {ContextMenuActions} actions
 * @param {{ isPackaged?: boolean }} [options]
 * @returns {import("electron").MenuItemConstructorOptions[]}
 */
export function buildContextMenuTemplate(
  params,
  actions,
  { isPackaged = true } = {},
) {
  /** @type {import("electron").MenuItemConstructorOptions[]} */
  const template = [];
  const section = (items) => {
    const real = items.filter(Boolean);
    if (!real.length) return;
    if (template.length) template.push({ type: "separator" });
    template.push(...real);
  };

  const hasSelection = Boolean(params.selectionText?.trim());
  const isHttpLink = /^https?:\/\//i.test(params.linkURL ?? "");

  // Spelling — only for a misspelled word inside an editable field.
  if (params.isEditable && params.misspelledWord) {
    const suggestions = (params.dictionarySuggestions ?? []).slice(0, 5);
    section([
      ...(suggestions.length
        ? suggestions.map((word) => ({
            id: `spelling:${word}`,
            label: word,
            click: () => actions.replaceMisspelling(word),
          }))
        : [{ id: "spelling-none", label: "No Guesses Found", enabled: false }]),
      {
        id: "spelling-add",
        label: "Learn Spelling",
        click: () => actions.addToDictionary(params.misspelledWord),
      },
    ]);
  }

  if (params.isEditable) {
    section([
      {
        id: "undo",
        role: "undo",
        enabled: params.editFlags?.canUndo !== false,
      },
      {
        id: "redo",
        role: "redo",
        enabled: params.editFlags?.canRedo !== false,
      },
    ]);
    section([
      { id: "cut", role: "cut", enabled: params.editFlags?.canCut !== false },
      {
        id: "copy",
        role: "copy",
        enabled: params.editFlags?.canCopy !== false,
      },
      {
        id: "paste",
        role: "paste",
        enabled: params.editFlags?.canPaste !== false,
      },
      {
        id: "paste-plain",
        role: "pasteAndMatchStyle",
        enabled: params.editFlags?.canPaste !== false,
      },
      { id: "select-all", role: "selectAll" },
    ]);
  } else if (hasSelection) {
    section([
      { id: "copy", role: "copy" },
      { id: "select-all", role: "selectAll" },
    ]);
  }

  if (isHttpLink) {
    section([
      {
        id: "open-link",
        label: "Open Link in Browser",
        click: () => actions.openExternal(params.linkURL),
      },
      {
        id: "copy-link",
        label: "Copy Link",
        click: () => actions.copyText(params.linkURL),
      },
    ]);
  }

  if (params.mediaType === "image" && params.srcURL) {
    section([
      {
        id: "copy-image",
        label: "Copy Image",
        click: () => actions.copyImage(params.srcURL),
      },
      {
        id: "copy-image-url",
        label: "Copy Image Address",
        click: () => actions.copyText(params.srcURL),
      },
    ]);
  }

  if (!template.length) {
    // Blank area: give it a reload, like Safari's page context menu.
    section([{ id: "reload", label: "Reload", click: () => actions.reload() }]);
  }

  if (!isPackaged) {
    section([
      {
        id: "inspect",
        label: "Inspect Element",
        click: () => actions.inspectElement(params.x, params.y),
      },
    ]);
  }

  return template;
}
