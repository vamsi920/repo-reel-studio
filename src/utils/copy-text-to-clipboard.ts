import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import { displayErrorToast } from "./custom-toast-handlers";

/**
 * Write `text` to the clipboard, reporting failure instead of throwing.
 *
 * `navigator.clipboard` is undefined in insecure contexts — a self-hosted UI
 * reached over plain http on a LAN address, for example — and `writeText`
 * rejects when the browser denies the permission. Awaiting it bare turns both
 * cases into an unhandled rejection behind a button that silently does
 * nothing. The returned boolean lets the caller hold back its "Copied"
 * confirmation when the write did not happen.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    displayErrorToast(i18n.t(I18nKey.ERROR$GENERIC));
    return false;
  }
}
