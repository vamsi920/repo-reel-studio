import React from "react";
import i18n from "#/i18n";
import { applyDocumentLanguage } from "#/i18n/document-language";

/**
 * Keeps `<html lang>` (and an explicit `dir`) in sync with i18next so screen
 * readers announce the translated UI in the right language. i18next emits
 * `languageChanged` both when the detector resolves the initial language and
 * on every `changeLanguage`, so one subscription covers both.
 */
export function useDocumentLanguage() {
  React.useEffect(() => {
    const sync = (language?: string) => {
      applyDocumentLanguage(language ?? i18n.resolvedLanguage ?? i18n.language);
    };

    sync();
    i18n.on("languageChanged", sync);

    return () => {
      i18n.off("languageChanged", sync);
    };
  }, []);
}
